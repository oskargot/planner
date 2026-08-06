/*
 * The mine's stored half.
 *
 * The board itself is a pure function of a seed (see mine/board.js) and is
 * never stored. The only thing that needs persisting is what you've uncovered
 * — and that's the part with a real design problem in it, because an infinite
 * board can be dug forever.
 *
 * One row per dug cell would mean thousands of synced rows within a week, all
 * of them carrying the standard id/created_at/updated_at/deleted overhead to
 * say one bit. So cells are stored as bitmasks over 16×16 chunks: a fully dug
 * chunk is 256 cells in a 64-character hex string, and a chunk you've barely
 * touched costs the same one small row.
 *
 * The chunk id is DERIVED from the world seed and coordinates rather than a
 * uuid. That matters for sync: two devices digging the same patch offline
 * produce the same row id and merge by LWW, instead of minting two rows for
 * one chunk and needing a unique index and a merge rule on the server the way
 * habit_entries does. The cost is that a genuine offline split can lose a few
 * dug cells — which is nothing, because digging is free and you simply dig
 * again. The gems you pulled out are their own rows and are never at risk.
 *
 * Grit never moves in this file directly: it goes through tumbler.js's
 * addGrit, which stays the one choke point that writes tumbler_ledger.
 */

import { db, insertRowWithId, updateRow, softDelete, getMeta, setMeta } from './db.js';
import { addGrit, mintGem } from './tumbler.js';
import { gemAt, isGem, floodFill, seedNumber, shardValue } from '../mine/board.js';

export const CHUNK = 16;
const BITS = CHUNK * CHUNK;
const EMPTY_MASK = '0'.repeat(BITS / 4);

/*
 * What a careful extraction costs. This is the entire economy of the minigame:
 * digging is free because digging is how you learn anything, and extraction is
 * the commitment. Guessing burns grit; reading the board doesn't.
 *
 * Was 6, which made the mine a grit drain rather than a reason to open it. The
 * note it was tuned against said "~11-grit average crush", but 11 is the value
 * of a single CLEAR stone, not the average of the grade table. The real
 * expectation at prestige 0 is 55/25/13/5.5/1.5 over grit 2/5/11/24/55, which
 * is 5.9 — 6.1 with the mine's 3% rare chance. So a perfectly read extraction
 * returned about a tenth of a grit over its own price, and every misread cell
 * was a flat -6. Careful play paid nothing and careless play paid less.
 *
 * At 3 a correct read clears about +3 before you've even decided whether to
 * keep the stone, and the wall it exists to hold still holds: extracting blind
 * is -3 against 12% odds on a ~6-grit stone, or about -2.3 a cell, so "hold
 * every square" is still comfortably worse than reading the numbers.
 *
 * Deliberately NOT refunded when the ground turns out empty, which was the
 * other obvious fix. Costing nothing to be wrong is the same thing as costing
 * nothing to guess: it takes the blind-extraction line from -2.3 to about -0.5
 * a cell and the numbers on the board stop being worth reading.
 */
export const EXTRACT_COST = 3;

// ---- bitmasks ----

const bitIndex = (x, y) => (((y % CHUNK) + CHUNK) % CHUNK) * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK);

function maskHas(mask, bit) {
  const char = parseInt((mask || EMPTY_MASK)[bit >> 2] || '0', 16);
  return (char & (1 << (bit & 3))) !== 0;
}

function maskSet(mask, bit) {
  const m = (mask || EMPTY_MASK).split('');
  const i = bit >> 2;
  m[i] = ((parseInt(m[i] || '0', 16) | (1 << (bit & 3))) >>> 0).toString(16);
  return m.join('');
}

// Floor division, so negative coordinates land in the right chunk rather than
// folding back toward zero — the board runs in all four directions.
export const chunkOf = (n) => Math.floor(n / CHUNK);

// Deterministic, and namespaced by the world seed so a prestige reroll can
// never collide with the chunks of the world before it.
const chunkId = (worldSeed, cx, cy) => `mine:${worldSeed}:${cx}:${cy}`;

// ---- world ----

/*
 * The world seed and the prestige level come from different places on purpose.
 * The level is COUNTED from tumbler_ledger rows, like every other upgrade, so
 * it can't be clobbered by a stale sync. The seed can't be derived from
 * anything, so it's synced meta and takes LWW — and if two devices ever did
 * disagree about it, the worst case is a board that looks unfamiliar, not lost
 * gems or lost grit.
 */
export async function getWorldSeed() {
  let seed = await getMeta('mine_seed');
  if (!seed) {
    seed = `w${Date.now().toString(36)}`;
    await setMeta('mine_seed', seed);
  }
  return seed;
}

export function allChunks() {
  return db.mine_chunks.filter((c) => !c.deleted).toArray();
}

// The dug/whole state of a patch, as a lookup the board module can call
// millions of times during a flood fill without touching the database.
export function chunkLookup(chunks, worldSeed) {
  const byKey = new Map();
  for (const c of chunks) {
    if (c.world_seed !== worldSeed) continue;
    byKey.set(`${c.cx},${c.cy}`, c);
  }
  return {
    isDug(x, y) {
      const c = byKey.get(`${chunkOf(x)},${chunkOf(y)}`);
      return c ? maskHas(c.dug, bitIndex(x, y)) : false;
    },
    isWhole(x, y) {
      const c = byKey.get(`${chunkOf(x)},${chunkOf(y)}`);
      return c ? maskHas(c.whole, bitIndex(x, y)) : false;
    },
  };
}

async function writeCells(worldSeed, cells, { whole = false } = {}) {
  // Group by chunk so a flood fill that crosses four chunks is four row
  // writes, not one per cell.
  const byChunk = new Map();
  for (const [x, y] of cells) {
    const key = `${chunkOf(x)},${chunkOf(y)}`;
    if (!byChunk.has(key)) byChunk.set(key, []);
    byChunk.get(key).push([x, y]);
  }

  for (const [key, list] of byChunk) {
    const [cx, cy] = key.split(',').map(Number);
    const id = chunkId(worldSeed, cx, cy);
    const existing = await db.mine_chunks.get(id);
    let dug = existing && !existing.deleted ? existing.dug : EMPTY_MASK;
    let wholeMask = existing && !existing.deleted ? existing.whole : EMPTY_MASK;
    for (const [x, y] of list) {
      const bit = bitIndex(x, y);
      dug = maskSet(dug, bit);
      if (whole) wholeMask = maskSet(wholeMask, bit);
    }
    if (existing) {
      await updateRow('mine_chunks', id, { dug, whole: wholeMask, deleted: 0 });
    } else {
      await insertRowWithId('mine_chunks', id, {
        world_seed: worldSeed,
        cx,
        cy,
        dug,
        whole: wholeMask,
      });
    }
  }
}

/*
 * Swing the pick at a cell.
 *
 * Empty ground opens, and a zero takes its whole region with it. A gem takes
 * the hit: it shatters into shards worth a third of its crush value, and —
 * this is the part that actually costs you — no `gems` row is created, so it
 * fills no square in the collection. The log only remembers what came out
 * whole. That's the reason to be careful, and it needs no punishment mechanic
 * to enforce it.
 */
export async function digCell(worldSeed, prestige, x, y, lookup) {
  const seed = seedNumber(worldSeed);
  if (lookup.isDug(x, y)) return null;

  if (isGem(seed, x, y, prestige)) {
    const gem = gemAt(seed, x, y, prestige);
    const shards = shardValue(gem);
    await writeCells(worldSeed, [[x, y]]);
    await addGrit(shards, 'shard', { note: `${gem.species}:${gem.grade}` });
    return { kind: 'shattered', gem, shards };
  }

  const opened = floodFill(seed, x, y, prestige, lookup.isDug);
  await writeCells(worldSeed, opened);
  return { kind: 'dug', opened: opened.length };
}

/*
 * Extract carefully. Costs grit whether or not you were right, which is what
 * stops "long-press every cell" from being the whole game — without a price on
 * being wrong there'd be no reason to ever read a number.
 */
export async function extractCell(worldSeed, prestige, x, y, lookup, grit) {
  if (lookup.isDug(x, y)) return null;
  if (grit < EXTRACT_COST) return { kind: 'poor' };

  const seed = seedNumber(worldSeed);
  await addGrit(-EXTRACT_COST, 'extract', { note: `${x},${y}` });

  if (!isGem(seed, x, y, prestige)) {
    await writeCells(worldSeed, [[x, y]]);
    return { kind: 'empty' };
  }

  const found = gemAt(seed, x, y, prestige);
  await writeCells(worldSeed, [[x, y]], { whole: true });
  // Through mintGem like every other stone, so the collection square and the
  // discovery bounty happen in exactly one place in the app.
  const gem = await mintGem({
    seed: `${worldSeed}:${x}:${y}`,
    species: found.species,
    grade: found.grade,
    cycle_key: 'mined',
  });
  return { kind: 'extracted', gem };
}

/*
 * Prestige. Rerolls the world, drops every chunk dug in the old one, and
 * leaves permanently richer ground behind.
 *
 * Tombstoning the old chunks rather than leaving them is the point: they're
 * unreachable the moment the seed changes (the ids are namespaced by it), so
 * keeping them would be pure sync weight that grows every reset. The mechanic
 * and the storage want the same thing.
 *
 * Nothing you own is touched. The collection, the shelf and the grit balance
 * all survive — this resets the ground, not your work.
 */
export async function resetWorld() {
  const stale = await db.mine_chunks.filter((c) => !c.deleted).toArray();
  for (const c of stale) await softDelete('mine_chunks', c.id);
  const next = `w${Date.now().toString(36)}`;
  await setMeta('mine_seed', next);
  return next;
}
