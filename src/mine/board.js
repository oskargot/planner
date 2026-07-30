/*
 * The mine's board. Pure functions, no DB, no React, no stored grid.
 *
 * It's minesweeper with the polarity reversed: the "mines" are the gems. The
 * numbers don't warn you away from anything — they tell you where to dig
 * carefully instead of swinging. That inversion is the whole reason this fits
 * the app: breaking a gem costs you something you never had, so the minigame
 * has no fail state and no way to feel late, which is the rule the rest of the
 * rock economy already lives by.
 *
 * Infinite means genuinely infinite: nothing is generated, allocated or
 * stored. Whether a cell holds a gem is a hash of (worldSeed, x, y), so any
 * device computes an identical board from one short string, the coordinates
 * can run as far as JS integers go, and there is no world to sync. Same trick
 * gems.js uses for facet geometry.
 *
 * What IS stored is only what you've uncovered — see db/mine.js, which keeps
 * it as one bitmask row per 16×16 chunk rather than a row per cell.
 */

import { SPECIES, GRADES, rng, rollGrade } from '../tumbler/gems.js';

// 32-bit mix of three numbers into a uniform-ish 0..1. Deliberately not
// rng(`${seed}:${x}:${y}`) — that allocates a string per cell, and a flood
// fill asks about thousands of cells inside one frame.
function cellHash(seed, x, y) {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ (x + 0x85ebca6b), 0xcc9e2d51);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y + 0xc2b2ae35), 0x1b873593);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// The world seed is a string on the row; hash it once per board, not per cell.
export function seedNumber(worldSeed) {
  let h = 2166136261;
  const s = String(worldSeed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/*
 * Gem density, and what prestige buys.
 *
 * Higher density cuts both ways on purpose: more gems in the ground, but a
 * crowded board is genuinely harder to deduce — more cells sit ambiguous with
 * no safe move. So prestige makes the mine richer AND harder, rather than
 * just multiplying a number.
 */
export const BASE_DENSITY = 0.12;
export const DENSITY_PER_PRESTIGE = 0.02;
export const MAX_PRESTIGE = 5;

export function density(prestige = 0) {
  return BASE_DENSITY + DENSITY_PER_PRESTIGE * Math.min(prestige, MAX_PRESTIGE);
}

export function isGem(seed, x, y, prestige = 0) {
  return cellHash(seed, x, y) < density(prestige);
}

/*
 * What's actually buried at (x, y). Decided by the coordinates, never rolled
 * when you tap — the same rule barrels follow. There's no rerolling a poor
 * find by extracting it on the other device, and the number you can see in the
 * ground is the number you get.
 *
 * Prestige raises grade the way the workshop's quality upgrade does, through
 * the same biased roll, so a deep-prestige world is better ground as well as
 * denser ground.
 */
export function gemAt(seed, x, y, prestige = 0) {
  const next = rng(`${seed}:${x}:${y}`);
  next(); // burn one, same as rollGem
  const r = next();
  // Rare species are rarer here than in a barrel: the mine is the fast way to
  // get stones, and it shouldn't also be the best way to get the rare ones.
  const species =
    r < 0.03 + prestige * 0.005
      ? SPECIES[6 + Math.floor(next() * 3)].key
      : SPECIES[Math.floor(next() * 6)].key;
  return { species, grade: rollGrade(next, prestige) };
}

// How many of the eight neighbours hold a gem. This is the whole information
// economy of the board, and it's eight hashes with no allocation.
export function neighbourCount(seed, x, y, prestige = 0) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (isGem(seed, x + dx, y + dy, prestige)) n++;
    }
  }
  return n;
}

/*
 * Flood fill from a zero cell, the way minesweeper does — except here the
 * payoff is reversed. On a normal board an auto-clear is housekeeping; here a
 * big fill is a windfall, because every cell it opens is free information
 * about where the gems are.
 *
 * The cap is not optional. At sane densities an open region is finite, but
 * "finite" is not a number, and on a board with no edges an uncapped fill is a
 * frozen tab rather than a slow one. Hitting the cap just stops early: the
 * frontier is still dug, so the next tap continues it.
 */
export const FILL_CAP = 1500;

export function floodFill(seed, x, y, prestige, isDug) {
  const opened = [];
  if (isGem(seed, x, y, prestige)) return opened;

  const seen = new Set([`${x},${y}`]);
  const queue = [[x, y]];

  while (queue.length && opened.length < FILL_CAP) {
    const [cx, cy] = queue.shift();
    opened.push([cx, cy]);
    // Only a zero spreads. A numbered cell is a wall — it's the edge of what
    // you know, which is exactly where the deduction happens.
    if (neighbourCount(seed, cx, cy, prestige) !== 0) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Never auto-open a gem: a fill must not shatter anything. It can't
        // reach one anyway (a gem's neighbours are all non-zero, so the fill
        // stops before it), but relying on that to protect the player's
        // stones is one refactor away from a very bad bug.
        if (isGem(seed, nx, ny, prestige)) continue;
        if (isDug(nx, ny)) continue;
        queue.push([nx, ny]);
      }
    }
  }
  return opened;
}

// What a shattered gem is worth. A third of its crush value, floor 1: enough
// that a bad swing isn't nothing, nowhere near enough to make swinging a
// strategy. The real cost of shattering isn't the grit — it's that no `gems`
// row is ever created, so it fills no square in the collection.
export function shardValue(gem) {
  const grade = GRADES[gem.grade] ?? GRADES[0];
  const species = SPECIES.find((s) => s.key === gem.species);
  return Math.max(1, Math.floor((grade.grit * (species?.rare ? 2 : 1)) / 3));
}
