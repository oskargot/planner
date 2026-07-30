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
import { CYCLES_BY_KEY, rollGem, gritValue } from '../tumbler/gems.js';

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
    costs: [120, 400, 900],
    base: 2,
    max: 3,
  },
  speed: {
    name: 'Better grit feed',
    blurb: 'Every cycle finishes sooner.',
    costs: [60, 140, 260, 460, 720],
    base: 0,
    max: 5,
  },
  quality: {
    name: 'Finer polish',
    blurb: 'Better stones, and rare ones turn up more often.',
    costs: [80, 180, 340, 560, 850],
    base: 0,
    max: 5,
  },
};

export const BARREL_MAX = UPGRADES.barrels.base + UPGRADES.barrels.max;

// Each speed level takes 8% off every cycle; five levels is a 40% cut, which
// turns the overnight cycle into something you can start after breakfast.
export function cycleDuration(cycleKey, speedLevel) {
  const cycle = CYCLES_BY_KEY[cycleKey] ?? CYCLES_BY_KEY.quick;
  return Math.round(cycle.hours * HOUR_MS * (1 - 0.08 * speedLevel));
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
  const levels = { barrels: 0, speed: 0, quality: 0 };
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

async function addGrit(delta, reason, { note = null, upgradeKey = null } = {}) {
  return insertRow('tumbler_ledger', {
    delta,
    reason,
    upgrade_key: upgradeKey,
    note,
  });
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

  const gem = await insertRow('gems', {
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

export async function buyUpgrade(key, currentLevel, grit) {
  const cost = upgradeCost(key, currentLevel);
  if (cost === null || cost > grit) return false;
  await addGrit(-cost, 'upgrade', { upgradeKey: key, note: UPGRADES[key].name });
  return true;
}
