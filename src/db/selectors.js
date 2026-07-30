// Read-side helpers shared by screens. Live, from Dexie.

import { db } from './db.js';
import { dayEndMs, logicalDay, daysBetween, addDays } from './time.js';
import { SIZE_POINTS } from './actions.js';
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

/*
 * Per-habit streaks. Same "today hasn't had its chance yet" rule the greeting
 * uses: an unchecked today is stepped over rather than counted as a miss, or
 * every streak in the app would read zero until the first check of the
 * morning — which is precisely when a streak is supposed to be the reason you
 * check it.
 *
 * `best` walks the whole history rather than only the current run, so a streak
 * you broke last month is still worth something.
 */
export function habitStreaks(entries, today = logicalDay()) {
  const byHabit = new Map();
  for (const e of entries) {
    if (e.deleted) continue;
    if (!byHabit.has(e.habit_id)) byHabit.set(e.habit_id, new Set());
    byHabit.get(e.habit_id).add(e.day);
  }

  const out = new Map();
  for (const [habitId, days] of byHabit) {
    let cursor = days.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (days.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }

    // Best run: walk the sorted days and break wherever there's a gap.
    const sorted = [...days].sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of sorted) {
      run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    }

    out.set(habitId, { streak, best, total: days.size, days });
  }
  return out;
}

export function useHabitStreaks() {
  return useLiveQuery(async () => {
    const entries = await db.habit_entries.toArray();
    return habitStreaks(entries);
  }, [], null);
}

/*
 * Everything the Stats page shows, in one pass — same reasoning as
 * useGreetingState: the numbers have to agree with each other, and eight
 * separate live queries settling at eight different moments is how you get a
 * page where the totals don't add up.
 *
 * Nothing here is stored. Every number is derived from the ledger and the
 * source tables, so there is still no balance column anywhere, and a stat can
 * never disagree with the history it came from.
 *
 * Grit is deliberately absent. The tumbler is a separate economy and this page
 * belongs to points; mixing them here would be the first crack in that wall.
 */
const WINDOW_DAYS = 30;
const WEEKS = 8;

export function useStats() {
  return useLiveQuery(async () => {
    const today = logicalDay();
    const window = Array.from({ length: WINDOW_DAYS }, (_, i) =>
      addDays(today, -(WINDOW_DAYS - 1 - i))
    );
    const windowSet = new Set(window);

    // ---- ledger ----
    const ledger = (await db.ledger.toArray()).filter((r) => !r.deleted);
    const perDay = new Map(window.map((d) => [d, { day: d, earned: 0, spent: 0 }]));
    const bySource = { task: 0, habit: 0, project: 0, adjust: 0 };
    let lifetimeEarned = 0;
    let lifetimeSpent = 0;
    let balance = 0;

    for (const r of ledger) {
      balance += r.delta;
      if (r.reason === 'purchase') {
        // A refund is a positive row with reason 'purchase'; netting them
        // keeps "spent" honest rather than counting a refunded buy twice.
        lifetimeSpent -= r.delta;
      } else {
        if (r.delta > 0) lifetimeEarned += r.delta;
        if (bySource[r.reason] !== undefined) bySource[r.reason] += r.delta;
      }
      if (windowSet.has(r.day)) {
        const slot = perDay.get(r.day);
        if (r.reason === 'purchase') slot.spent -= r.delta;
        else slot.earned += r.delta;
      }
    }

    const days = window.map((d) => perDay.get(d));
    const peak = Math.max(1, ...days.map((d) => d.earned));
    const bestDay = days.reduce((a, b) => (b.earned > a.earned ? b : a), days[0]);

    // ---- habits ----
    const habitRows = (await db.habits.toArray()).filter((h) => !h.deleted && h.active);
    const entries = await db.habit_entries.toArray();
    const streaks = habitStreaks(entries, today);
    const habits = habitRows.map((h) => {
      const s = streaks.get(h.id) ?? { streak: 0, best: 0, days: new Set() };
      // Only count days the habit actually existed for, or a habit added last
      // week reads as 3% consistent forever.
      const eligible = window.filter((d) => h.created_at <= dayEndMs(d));
      const done = eligible.filter((d) => s.days.has(d));
      return {
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        color: h.color,
        streak: s.streak,
        best: s.best,
        done: done.length,
        eligible: eligible.length,
        ratio: eligible.length ? done.length / eligible.length : 0,
        marks: window.map((d) => (s.days.has(d) ? 1 : h.created_at <= dayEndMs(d) ? 0 : -1)),
      };
    });

    // ---- tasks ----
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deleted);
    const doneTasks = tasks.filter((t) => t.done_at);
    const weeks = Array.from({ length: WEEKS }, (_, i) => ({
      start: addDays(today, -(7 * (WEEKS - 1 - i)) - 6),
      end: addDays(today, -(7 * (WEEKS - 1 - i))),
      count: 0,
      points: 0,
    }));
    const sizes = { S: 0, M: 0, L: 0 };
    for (const t of doneTasks) {
      sizes[t.size] = (sizes[t.size] ?? 0) + 1;
      const d = logicalDay(t.done_at);
      const w = weeks.find((wk) => d >= wk.start && d <= wk.end);
      if (w) {
        w.count++;
        w.points += SIZE_POINTS[t.size] ?? 0;
      }
    }
    const weekPeak = Math.max(1, ...weeks.map((w) => w.count));

    // ---- projects ----
    const touches = (await db.project_touches.toArray()).filter((t) => !t.deleted);
    const projects = (await db.projects.toArray())
      .filter((p) => !p.deleted && p.status === 'active')
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        touched: touches.filter((t) => t.project_id === p.id && windowSet.has(t.day)).length,
        stale: staleness(touches, p.id),
      }))
      .sort((a, b) => b.touched - a.touched);

    return {
      today,
      balance,
      lifetimeEarned,
      lifetimeSpent,
      bySource,
      days,
      peak,
      bestDay,
      habits,
      weeks,
      weekPeak,
      sizes,
      tasksOpen: tasks.length - doneTasks.length,
      tasksDone: doneTasks.length,
      projects,
      windowDays: WINDOW_DAYS,
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
