/*
 * The tumbler's data layer — a completely separate economy from the points
 * ledger (§ the rock shop). Nothing in here ever writes to `ledger`, and
 * nothing in actions.js ever writes to `tumbler_ledger`. Tasks cannot buy
 * barrels and gems cannot buy shop items; that separation is the whole reason
 * the game is a reason to open the app rather than another chore attached to
 * one.
 *
 * Grit follows the same append-only discipline as points: there is no grit
 * column anywhere, the balance is a sum, and an upgrade is a negative row.
 * That isn't just for consistency — a plain counter synced last-write-wins
 * would silently lose grit whenever the phone and the iPad both spent some
 * while offline. Upgrade LEVELS are counted the same way, from the rows that
 * bought them.
 */

import { db, insertRow, updateRow, softDelete, uuid } from './db.js';
import { CYCLES_BY_KEY, rollGem, gritValue, canFuse, fuseOutcome } from '../tumbler/gems.js';
// The one thread between the two economies, and it runs in one direction:
// finding something new pays points. Nothing here ever reads the points
// ledger, and nothing in actions.js ever writes grit.
import { awardDiscovery } from './actions.js';

const HOUR_MS = 3600000;

// ---- upgrades ----

/*
 * Costs are cumulative levels, index 0 = the price of going from level 0 to 1.
 * Barrels start at 2: one barrel means the whole game is a single timer, and
 * two gives you something to compare against while you wait.
 */
export const UPGRADES = {
  barrels: {
    name: 'Another barrel',
    blurb: 'One more stone tumbling at a time.',
    costs: [90, 300, 700],
    base: 2,
    max: 3,
  },
  speed: {
    name: 'Better grit feed',
    blurb: 'Every cycle finishes sooner.',
    costs: [45, 110, 210, 380, 600],
    base: 0,
    max: 5,
  },
  quality: {
    name: 'Finer polish',
    blurb: 'Better stones, and rare ones turn up more often.',
    costs: [60, 140, 270, 450, 700],
    base: 0,
    max: 5,
  },
  /*
   * Prestige, and the only upgrade that takes something away. Buying it
   * rerolls the mine's world and forgets everywhere you've dug, in exchange
   * for permanently richer and better ground.
   *
   * It's counted from tumbler_ledger rows like every other level, which is
   * what lets the mine's density be derived rather than stored — the seed is
   * the only part that has to be meta.
   *
   * Nothing you own is at stake: the collection, the shelf and the grit all
   * survive. It resets the ground, not your work.
   */
  prestige: {
    name: 'Deeper claim',
    blurb: 'Rerolls the mine into richer ground. Forgets where you have dug.',
    costs: [200, 500, 1100, 2200, 4000],
    base: 0,
    max: 5,
  },
};

export const BARREL_MAX = UPGRADES.barrels.base + UPGRADES.barrels.max;

// Each speed level takes 10% off every cycle; five levels is half, which turns
// the overnight cycle into an afternoon. Was 8% — the whole early game came
// out slower in practice than it read on paper.
export function cycleDuration(cycleKey, speedLevel) {
  const cycle = CYCLES_BY_KEY[cycleKey] ?? CYCLES_BY_KEY.quick;
  return Math.round(cycle.hours * HOUR_MS * (1 - 0.1 * speedLevel));
}

export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  return level >= u.max ? null : u.costs[level];
}

// ---- reading ----

// Grit balance and upgrade levels, both derived from the append-only rows.
export function summarise(ledgerRows) {
  const live = ledgerRows.filter((r) => !r.deleted);
  const grit = live.reduce((sum, r) => sum + r.delta, 0);
  const levels = { barrels: 0, speed: 0, quality: 0, prestige: 0 };
  for (const r of live) {
    if (r.upgrade_key && levels[r.upgrade_key] !== undefined) levels[r.upgrade_key]++;
  }
  return {
    grit,
    levels,
    barrelCount: UPGRADES.barrels.base + levels.barrels,
  };
}

// A barrel's state is pure arithmetic on started_at, so it is correct after any
// amount of time with the app closed — there is no tick to miss.
export function barrelState(barrel, now = Date.now()) {
  if (!barrel || !barrel.started_at) return 'idle';
  return now >= barrel.started_at + barrel.duration_ms ? 'ready' : 'running';
}

export function remainingMs(barrel, now = Date.now()) {
  if (!barrel?.started_at) return 0;
  return Math.max(0, barrel.started_at + barrel.duration_ms - now);
}

// "3h 20m" / "12m" / "40s". Deliberately coarse above an hour — a countdown to
// the second on a 14-hour timer is just anxiety.
export function formatRemaining(ms) {
  if (ms <= 0) return 'ready';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---- writing ----

/*
 * The one function that writes tumbler_ledger. db/mine.js spends and earns
 * grit through it rather than inserting rows of its own, so "grit only moves
 * here" survives the mine existing.
 */
export async function addGrit(delta, reason, { note = null, upgradeKey = null } = {}) {
  return insertRow('tumbler_ledger', {
    delta,
    reason,
    upgrade_key: upgradeKey,
    note,
  });
}

/*
 * The one function that mints a gem — barrels, fusion and the mine all come
 * through here.
 *
 * That's what makes the discovery bounty safe to add: filling a new square in
 * the collection pays points, and there is exactly one place in the app where
 * a square can be filled. Three call sites each remembering to award it would
 * be three chances to forget, and one of them would be the interesting one.
 */
export async function mintGem(fields) {
  const gem = await insertRow('gems', fields);
  // Carried back on the returned object rather than stored: the ledger row is
  // the record, this is just so the reveal can say "new find" in the moment
  // it happens. Nothing reads it back later.
  const discovered = await awardDiscovery(gem);
  return { ...gem, discovered };
}

// Barrels are addressed by slot, and rows are created lazily the first time a
// slot is used — so buying a barrel is only a ledger row, with no table to
// keep in step.
export async function barrelForSlot(slot) {
  const rows = await db.tumbler_barrels.where('slot').equals(slot).toArray();
  return rows.find((r) => !r.deleted) ?? null;
}

/*
 * Load a barrel and start it. The gem is decided HERE, at load time, and
 * stashed on the row — not rolled when you come back to open it. Two reasons:
 * a device that syncs the finished barrel elsewhere yields the same stone, and
 * there's no way to reroll a bad result by collecting it somewhere else.
 */
export async function startBarrel(slot, cycleKey, { speedLevel, qualityLevel }) {
  const existing = await barrelForSlot(slot);
  if (existing && barrelState(existing) !== 'idle') return existing;

  const seed = uuid();
  const outcome = rollGem(seed, { cycleKey, qualityLevel });
  const fields = {
    slot,
    cycle_key: cycleKey,
    seed,
    species: outcome.species,
    grade: outcome.grade,
    started_at: Date.now(),
    duration_ms: cycleDuration(cycleKey, speedLevel),
    collected_at: null,
  };
  if (existing) {
    await updateRow('tumbler_barrels', existing.id, fields);
    return { ...existing, ...fields };
  }
  return insertRow('tumbler_barrels', fields);
}

/*
 * Open a finished barrel: mint the gem, empty the barrel. Re-reads the row
 * first so a double-tap can't mint two gems from one cycle — the same guard
 * completeTask() uses.
 */
export async function collectBarrel(slot) {
  const barrel = await barrelForSlot(slot);
  if (!barrel || barrelState(barrel) !== 'ready') return null;

  const gem = await mintGem({
    seed: barrel.seed,
    species: barrel.species,
    grade: barrel.grade,
    cycle_key: barrel.cycle_key,
  });
  await updateRow('tumbler_barrels', barrel.id, {
    started_at: null,
    duration_ms: 0,
    seed: null,
    species: null,
    grade: null,
    cycle_key: null,
    collected_at: Date.now(),
  });
  return gem;
}

/*
 * Crush a gem for grit. The gem leaves the shelf, but the collection log reads
 * every gem ever minted from the tumbler ledger's crush rows plus the surviving
 * gems — so crushing a duplicate never costs you the discovery.
 */
export async function crushGem(gem) {
  const fresh = await db.gems.get(gem.id);
  if (!fresh || fresh.deleted) return 0;
  const value = gritValue(fresh);
  await softDelete('gems', gem.id);
  await addGrit(value, 'crush', {
    note: `${fresh.species}:${fresh.grade}`,
  });
  return value;
}

/*
 * Fuse three stones into one better one.
 *
 * The inputs are tombstoned, not erased — which is the whole reason this is
 * safe to do with something you like. The collection log reads every gem row
 * that has ever existed, tombstones included, so a stone you fused away keeps
 * its square filled forever. Fusing costs you the object, never the discovery,
 * exactly like crushing.
 *
 * No grit changes hands: the price is the three stones. That also means this
 * function never touches tumbler_ledger, and the upgrade levels derived from
 * it can't be disturbed by fusing.
 *
 * Re-reads every input before committing, so two taps — or the same shelf open
 * on the phone and the iPad — can't spend one stone twice.
 */
export async function fuseGems(gems) {
  const fresh = [];
  for (const g of gems) {
    const row = await db.gems.get(g.id);
    if (!row || row.deleted) return null;
    fresh.push(row);
  }
  if (!canFuse(fresh)) return null;

  const seed = uuid();
  const outcome = fuseOutcome(seed, fresh);
  for (const row of fresh) await softDelete('gems', row.id);
  return mintGem({
    seed,
    species: outcome.species,
    grade: outcome.grade,
    cycle_key: 'fused',
  });
}

/*
 * Undo a crush. The stone comes back and the grit goes out again as its own
 * negative row — the crush row itself is never touched, because the grit
 * balance and the upgrade levels are both sums over these rows and editing one
 * in place is how a device that synced the original ends up disagreeing about
 * both.
 */
export async function uncrushGem(gem, value) {
  await updateRow('gems', gem.id, { deleted: 0 });
  await addGrit(-value, 'crush', { note: `undo: ${gem.species}:${gem.grade}` });
}

export async function buyUpgrade(key, currentLevel, grit) {
  const cost = upgradeCost(key, currentLevel);
  if (cost === null || cost > grit) return false;
  await addGrit(-cost, 'upgrade', { upgradeKey: key, note: UPGRADES[key].name });
  return true;
}
