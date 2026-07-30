/*
 * Gem generation. Pure functions, no DB, no React.
 *
 * Everything a gem looks like is derived from one string seed, so the whole
 * collection is content the app doesn't have to ship: no sprite sheet, no art
 * pipeline, and a gem drawn on the phone and on the iPad is the same gem.
 *
 * What IS stored on the row is the gem's identity — species, grade, name. The
 * seed only drives the drawing. That split is deliberate: tweaking the facet
 * maths later re-draws old gems, but it can never turn Oskar's Flawless Opal
 * into a Chipped Jade.
 */

// mulberry32, seeded off a string hash. Small, fast, and stable across
// engines — Math.random() would give a different gem on every render.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = hash(String(seed));
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Nine species. The first six are the common ones and map one-to-one onto the
 * theme's six accents, so the collection is literally the app's palette laid
 * out as objects. The last three are rare and paint themselves.
 */
export const SPECIES = [
  { key: 'rose',   name: 'Rose Quartz', accent: 1, rare: false, facets: 6 },
  { key: 'carn',   name: 'Carnelian',   accent: 2, rare: false, facets: 8 },
  { key: 'citrine',name: 'Citrine',     accent: 3, rare: false, facets: 5 },
  { key: 'jade',   name: 'Jade',        accent: 4, rare: false, facets: 7 },
  { key: 'aqua',   name: 'Aquamarine',  accent: 5, rare: false, facets: 6 },
  { key: 'amethyst',name: 'Amethyst',   accent: 6, rare: false, facets: 9 },
  { key: 'opal',   name: 'Opal',        accent: null, rare: true, facets: 10 },
  { key: 'moon',   name: 'Moonstone',   accent: null, rare: true, facets: 4 },
  // Five is the floor: at three the polygon reads as an arrowhead, not a stone.
  { key: 'obsidian',name: 'Obsidian',   accent: null, rare: true, facets: 5 },
];

export const SPECIES_BY_KEY = Object.fromEntries(SPECIES.map((s) => [s.key, s]));

// Five grades, worst first. `grit` is what crushing one pays out.
export const GRADES = [
  { key: 'chipped',   name: 'Chipped',   grit: 2 },
  { key: 'clouded',   name: 'Clouded',   grit: 5 },
  { key: 'clear',     name: 'Clear',     grit: 11 },
  { key: 'brilliant', name: 'Brilliant', grit: 24 },
  { key: 'flawless',  name: 'Flawless',  grit: 55 },
];

// Rare species are worth double when crushed — which is exactly the moment
// you don't want to crush them. That tension is the point.
export function gritValue(gem) {
  const grade = GRADES[gem.grade] ?? GRADES[0];
  const species = SPECIES_BY_KEY[gem.species];
  return grade.grit * (species?.rare ? 2 : 1);
}

export function gemLabel(gem) {
  const species = SPECIES_BY_KEY[gem.species];
  return `${GRADES[gem.grade]?.name ?? '?'} ${species?.name ?? 'Stone'}`;
}

/*
 * The three cycles you can load a barrel with. Longer real time buys better
 * odds — that is the entire economy of the game, so these numbers are the
 * balance knobs.
 */
/*
 * Retuned down from 2 / 6 / 14 after a few weeks of living with it: the early
 * game was slow enough that a Quick cycle wasn't quick in any sense you'd
 * notice, and the first upgrade was days away. The shape is unchanged — longer
 * still means better, and the overnight cycle is still the one you start
 * before bed.
 */
export const CYCLES = [
  { key: 'quick',     name: 'Quick',     hours: 1,  quality: 0 },
  { key: 'standard',  name: 'Standard',  hours: 4,  quality: 1 },
  { key: 'overnight', name: 'Overnight', hours: 10, quality: 2 },
];

export const CYCLES_BY_KEY = Object.fromEntries(CYCLES.map((c) => [c.key, c]));

/*
 * Grade odds. `power` is how far the roll gets pushed toward the good end —
 * cycle quality plus the workshop's quality upgrade. Implemented as a biased
 * roll rather than a table per level so it stays readable: raising a uniform
 * roll to a power < 1 pushes it upward, and the exponent shrinks smoothly as
 * power climbs. Even at max there is no guarantee of a Flawless; the tail just
 * gets fatter.
 */
export function rollGrade(next, power) {
  const r = next();
  const biased = Math.pow(r, 1 / (1 + power * 0.45));
  // 55 / 25 / 13 / 5.5 / 1.5 at power 0
  if (biased > 0.985) return 4;
  if (biased > 0.93) return 3;
  if (biased > 0.8) return 2;
  if (biased > 0.55) return 1;
  return 0;
}

// Rare species get likelier with power too, but far more slowly than grade —
// they should stay events.
export function rollSpecies(next, power) {
  const r = next();
  const rareChance = 0.04 + power * 0.012;
  if (r < rareChance) return SPECIES[6 + Math.floor(next() * 3)].key;
  return SPECIES[Math.floor(next() * 6)].key;
}

/*
 * Turn a finished barrel into a gem. Deterministic in the seed, so a barrel's
 * outcome is fixed the moment it's loaded — not at the moment it's opened.
 * That matters: it means closing the app, changing the clock, or collecting on
 * a different device all produce the same stone.
 */
export function rollGem(seed, { cycleKey, qualityLevel = 0 }) {
  const cycle = CYCLES_BY_KEY[cycleKey] ?? CYCLES[0];
  const power = cycle.quality + qualityLevel;
  const next = rng(seed);
  // Burn one roll so seeds that hash to similar starts don't correlate.
  next();
  const species = rollSpecies(next, power);
  const grade = rollGrade(next, power);
  return { seed, species, grade };
}

/*
 * Fusion: three stones of one grade become one of the next grade up.
 *
 * It exists because the shelf had exactly one verb — crush — and every
 * duplicate was therefore worth the same handful of grit as the last one.
 * Fusion gives a pile of Clouded Jade somewhere to go that isn't the bin.
 *
 * The rule that makes it interesting rather than just arithmetic: the result's
 * species is drawn from the three you put in. Feed it a mixed handful and you
 * get a better stone of *something*; feed it three of a kind and you've aimed
 * it — which is how you finally finish a column of the collection instead of
 * waiting for the barrel to hand it to you. Three rare stones fuse into a rare
 * one for the same reason, with no special case for it.
 *
 * Flawless is the ceiling; there's nothing above it to fuse into.
 */
export const FUSE_COUNT = 3;

export function canFuse(gems) {
  if (gems.length !== FUSE_COUNT) return false;
  const grade = gems[0].grade;
  if (grade >= GRADES.length - 1) return false;
  return gems.every((g) => g.grade === grade);
}

export function fuseOutcome(seed, gems) {
  const next = rng(seed);
  next(); // burn one, same as rollGem
  return {
    seed,
    species: gems[Math.floor(next() * gems.length)].species,
    grade: Math.min(GRADES.length - 1, gems[0].grade + 1),
  };
}

/*
 * The drawing. Returns plain geometry — an array of {points, tone} facets plus
 * an outline — so the React component is dumb and this stays testable in node.
 *
 * A gem is a rosette: N outer vertices at jittered radii, a smaller table
 * polygon in the middle, and one facet quad per outer edge joining the two.
 * Higher grades get a tighter, more regular outline and a bigger table; low
 * grades are lopsided and cloudy.
 */
export function gemGeometry(gem) {
  const species = SPECIES_BY_KEY[gem.species] ?? SPECIES[0];
  const next = rng(`${gem.seed}:geo`);
  const n = species.facets;
  const grade = gem.grade;

  // Regularity climbs with grade: a Chipped stone wobbles, a Flawless is nearly
  // a perfect polygon.
  const jitter = 0.26 - grade * 0.055;
  const tableR = 0.3 + grade * 0.055;
  const spin = next() * Math.PI * 2;

  const outer = [];
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    const r = 0.92 * (1 - jitter / 2 + next() * jitter);
    outer.push([50 + Math.cos(a) * r * 46, 50 + Math.sin(a) * r * 46]);
  }
  const table = outer.map(([x, y]) => [50 + (x - 50) * tableR, 50 + (y - 50) * tableR]);

  // Each crown facet gets its own tone (0..1) so adjacent faces read as
  // catching light differently. Clear stones have more contrast between faces.
  const facets = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    facets.push({
      points: [outer[i], outer[j], table[j], table[i]],
      tone: 0.25 + next() * (0.35 + grade * 0.08),
    });
  }

  // Inclusions: flecks trapped in the stone. They're the visual tell for a bad
  // grade, and they vanish entirely at Flawless.
  const inclusions = [];
  const flecks = Math.max(0, 4 - grade);
  for (let i = 0; i < flecks; i++) {
    const a = next() * Math.PI * 2;
    const d = next() * 0.5;
    inclusions.push({
      cx: 50 + Math.cos(a) * d * 40,
      cy: 50 + Math.sin(a) * d * 40,
      r: 1.2 + next() * 2.4,
    });
  }

  return { outer, table, facets, inclusions, tableTone: 0.12 + next() * 0.1 };
}

const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/*
 * Fills, as CSS color strings. Common species paint themselves from their
 * accent token so a gem is always in the app's palette — and so Mono's flat
 * ink collapses them along with everything else. The rare three carry their
 * own identity: Opal cycles the whole rainbow, Moonstone is near-white,
 * Obsidian is ink.
 *
 * Tone is applied with color-mix against the page rather than opacity, so a
 * gem laid on the shelf doesn't let the shelf grain show through it.
 */
// A color-mix percentage outside 0–100 makes the WHOLE function invalid, and an
// invalid fill on an SVG polygon falls back to black — which showed up as one
// randomly black facet on high-grade stones. Every mix ratio goes through here.
const mix = (n) => Math.max(0, Math.min(100, Math.round(n)));

export function facetFill(gem, tone) {
  const species = SPECIES_BY_KEY[gem.species] ?? SPECIES[0];
  const pct = Math.round(tone * 100);
  if (species.key === 'moon') {
    return `color-mix(in srgb, var(--bg-surface) ${mix(100 - pct / 2)}%, var(--accent-6))`;
  }
  if (species.key === 'obsidian') {
    return `color-mix(in srgb, var(--text-primary) ${mix(55 + pct / 3)}%, var(--bg-surface))`;
  }
  if (species.key === 'opal') {
    // Position in the rainbow comes from the tone itself, so the facets of one
    // opal fan across hues instead of all landing on the same accent.
    const idx = 1 + (Math.floor(tone * 6) % 6);
    return `color-mix(in srgb, var(--accent-${idx}) ${mix(45 + pct / 2)}%, var(--bg-surface))`;
  }
  return `color-mix(in srgb, var(--accent-${species.accent}) ${mix(35 + pct * 0.8)}%, var(--bg-surface))`;
}

export { pts };
