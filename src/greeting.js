// The Home greeting: a time-of-day line plus one line of state.
//
// The rule that keeps this from becoming wallpaper: the second line is drawn
// from the actual database, never from a bag of generic encouragement. If
// there's nothing true to say, it says nothing. A line you stop reading after
// a week is worse than no line.
//
// Everything here is pure — it takes a clock and a plain state object and
// returns strings. Home does the querying.

export const NAME = 'Oskar';

// Wall-clock buckets, deliberately NOT the logical day: at 2am the logical day
// is still yesterday, but "Good morning" would be a lie.
export function greeting(date = new Date(), name = NAME) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return `Good morning, ${name}`;
  if (h >= 12 && h < 17) return `Good afternoon, ${name}`;
  if (h >= 17 && h < 22) return `Good evening, ${name}`;
  return `Still up, ${name}?`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/*
 * Candidate second lines, most interesting first. `state` is:
 *   { habitsTotal, habitsDone, streak, tasksOpen, earnedToday, balance,
 *     stalest: { name, days } | null, unredeemed: number,
 *     nextAffordable: { name, cost } | null, almost: { name, short } | null,
 *     tumblerReady: number, hour }
 *
 * Each entry returns a string or null. Null means "not true right now" and is
 * skipped — that's the whole filter.
 */
const LINES = [
  // Something is waiting for you — highest pull, and the only ones that are
  // about a thing that changed while the app was closed.
  (s) => (s.tumblerReady > 0
    ? s.tumblerReady === 1
      ? 'Something has finished tumbling.'
      : `${s.tumblerReady} barrels have finished tumbling.`
    : null),
  (s) => (s.unredeemed > 0
    ? `${plural(s.unredeemed, 'thing', 'things')} in your inventory, still unopened.`
    : null),

  // The day's shape.
  (s) => (s.habitsTotal > 0 && s.habitsDone === s.habitsTotal
    ? 'Every habit ticked. The rest of today is yours.'
    : null),
  (s) => (s.streak >= 3 ? `${s.streak} days in a row with something checked off.` : null),
  (s) => (s.habitsTotal > 0 && s.habitsDone === s.habitsTotal - 1
    ? 'One habit left on the board.'
    : null),

  // Nudges, phrased as observations rather than instructions.
  (s) => (s.stalest && s.stalest.days >= 7
    ? `${s.stalest.name} hasn't been touched in ${s.stalest.days} days.`
    : null),
  (s) => (s.almost ? `${s.almost.short} more points and ${s.almost.name} is yours.` : null),
  (s) => (s.nextAffordable ? `You can afford ${s.nextAffordable.name} now.` : null),

  // Plain state, the fallbacks that are almost always available.
  (s) => (s.earnedToday > 0 ? `${plural(s.earnedToday, 'point', 'points')} earned today.` : null),
  (s) => (s.habitsTotal > 0 && s.habitsDone > 0
    ? `${s.habitsDone} of ${s.habitsTotal} habits done.`
    : null),
  (s) => (s.tasksOpen > 0 ? `${plural(s.tasksOpen, 'task', 'tasks')} waiting.` : null),
  (s) => (s.tasksOpen === 0 && s.habitsTotal > 0 && s.habitsDone === 0 && s.hour < 12
    ? 'Clean slate.'
    : null),
];

/*
 * Pick a line. Candidates keep their priority order, but rather than always
 * showing the single top one, we rotate through the top few by a slot that
 * turns over every three hours — so opening the app twice in a morning says
 * the same thing, and opening it at breakfast and at dinner doesn't.
 */
export function flavorLine(state, date = new Date()) {
  const live = [];
  for (const fn of LINES) {
    const text = fn(state);
    if (text) live.push(text);
    if (live.length === 3) break; // never rotate past the interesting ones
  }
  if (!live.length) return null;
  const slot = Math.floor(date.getHours() / 3) + date.getDate();
  return live[slot % live.length];
}
