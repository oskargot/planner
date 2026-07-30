// Read-side helpers shared by screens. Live, from Dexie.

import { db } from './db.js';
import { dayEndMs, logicalDay, daysBetween, addDays } from './time.js';
import { useLiveQuery } from 'dexie-react-hooks';

// Balance is always computed from the ledger — there is no balance column (§4).
export function useBalance() {
  return useLiveQuery(async () => {
    let sum = 0;
    await db.ledger.each((r) => {
      if (!r.deleted) sum += r.delta;
    });
    return sum;
  }, [], null);
}

export function useEarnedToday() {
  // Net earnings: undo rows subtract, spending doesn't count against you.
  return useLiveQuery(async () => {
    const today = logicalDay();
    let sum = 0;
    await db.ledger.where('day').equals(today).each((r) => {
      if (!r.deleted && r.reason !== 'purchase') sum += r.delta;
    });
    return sum;
  }, [], 0);
}

// Heat map stats for a set of days: completed / active-that-day (§7).
// "Active that day" = created on or before that day and currently active —
// plus any habit that actually has an entry that day (covers habits since
// archived or deleted; that history was really earned).
export async function habitDayStats(days) {
  const habits = await db.habits.toArray();
  const entries = await db.habit_entries.where('day').anyOf(days).toArray();
  const byDay = new Map(days.map((d) => [d, { done: 0, active: 0, ratio: 0, habitIds: new Set() }]));

  for (const e of entries) {
    if (e.deleted) continue;
    const s = byDay.get(e.day);
    if (s) s.habitIds.add(e.habit_id);
  }
  for (const day of days) {
    const s = byDay.get(day);
    const end = dayEndMs(day);
    let active = 0;
    for (const h of habits) {
      const existedThen = h.created_at <= end;
      const countsToday = !h.deleted && h.active;
      if ((existedThen && countsToday) || s.habitIds.has(h.id)) active++;
    }
    s.done = s.habitIds.size;
    s.active = active;
    s.ratio = active > 0 ? s.done / active : 0;
  }
  return byDay;
}

// Map a ratio onto the theme's 7-stop heat ramp.
export function heatVar(ratio, done) {
  if (!done) return 'var(--heat-0)';
  const n = Math.max(1, Math.min(6, Math.ceil(ratio * 6)));
  return `var(--heat-${n})`;
}

/*
 * Everything the Home greeting's second line can draw on, in one live query.
 * It's a single pass over small tables rather than eight hooks, because the
 * line has to be picked from the whole picture — the ranking in greeting.js
 * only works if every candidate is evaluated against the same snapshot.
 */
export function useGreetingState() {
  return useLiveQuery(async () => {
    const today = logicalDay();

    const habits = (await db.habits.toArray()).filter((h) => !h.deleted && h.active);
    const entries = (await db.habit_entries.toArray()).filter((e) => !e.deleted);
    const todayIds = new Set(entries.filter((e) => e.day === today).map((e) => e.habit_id));

    // Days with at least one habit checked, walking back from today. Today not
    // being started yet doesn't break the streak — it hasn't had its chance —
    // so an empty today is stepped over rather than counted as a miss.
    const active = new Set(entries.map((e) => e.day));
    let streak = 0;
    let cursor = today;
    if (!active.has(cursor)) cursor = addDays(cursor, -1);
    while (active.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }

    const tasksOpen = (await db.tasks.toArray()).filter((t) => !t.deleted && !t.done_at).length;

    let balance = 0;
    let earnedToday = 0;
    await db.ledger.each((r) => {
      if (r.deleted) return;
      balance += r.delta;
      if (r.day === today && r.reason !== 'purchase') earnedToday += r.delta;
    });

    // Stalest active project that has ever been touched. Never-touched ones are
    // skipped rather than reported as stale forever — a brand new project
    // shouldn't be nagging on day one.
    const projects = (await db.projects.toArray()).filter((p) => !p.deleted && p.status === 'active');
    const touches = (await db.project_touches.toArray()).filter((t) => !t.deleted);
    let stalest = null;
    for (const p of projects) {
      const days = staleness(touches, p.id);
      if (days === null) continue;
      if (!stalest || days > stalest.days) stalest = { name: p.name, days };
    }

    const items = (await db.shop_items.toArray()).filter((i) => !i.deleted && !i.sold_out);
    // The best thing on the shelf you could take home right now, and the one
    // you're closest to — the two facts about the shop worth surfacing.
    let nextAffordable = null;
    let almost = null;
    for (const i of items) {
      if (i.cost <= balance) {
        if (!nextAffordable || i.cost > nextAffordable.cost) nextAffordable = { name: i.name, cost: i.cost };
      } else {
        const short = i.cost - balance;
        if (!almost || short < almost.short) almost = { name: i.name, short };
      }
    }

    const unredeemed = (await db.purchases.toArray()).filter((p) => !p.deleted && !p.redeemed_at).length;

    // A collected barrel has its started_at cleared, so "running or finished"
    // is the only state this has to test for.
    const now = Date.now();
    const tumblerReady = (await db.tumbler_barrels.toArray()).filter(
      (b) => !b.deleted && b.started_at && b.started_at + b.duration_ms <= now
    ).length;

    return {
      habitsTotal: habits.length,
      habitsDone: todayIds.size,
      streak,
      tasksOpen,
      earnedToday,
      balance,
      stalest,
      nextAffordable,
      almost,
      unredeemed,
      tumblerReady,
      hour: new Date().getHours(),
    };
  }, [], null);
}

// Days since a project was last touched; null = never.
export function staleness(touches, projectId) {
  const days = touches
    .filter((t) => t.project_id === projectId && !t.deleted)
    .map((t) => t.day)
    .sort();
  if (!days.length) return null;
  return daysBetween(days[days.length - 1], logicalDay());
}
