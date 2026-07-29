// Read-side helpers shared by screens. Live, from Dexie.

import { db } from './db.js';
import { dayEndMs, logicalDay, daysBetween } from './time.js';
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

// Days since a project was last touched; null = never.
export function staleness(touches, projectId) {
  const days = touches
    .filter((t) => t.project_id === projectId && !t.deleted)
    .map((t) => t.day)
    .sort();
  if (!days.length) return null;
  return daysBetween(days[days.length - 1], logicalDay());
}
