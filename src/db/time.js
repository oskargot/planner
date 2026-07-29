// The one place date math lives (§5.3). Everything that needs a "day"
// goes through logicalDay(); nothing else formats dates for storage.

const HOUR_MS = 3600000;

// Cached rollover hour; loaded from meta at boot, updated from Settings/sync.
let rolloverHour = 4;

export function getRolloverHour() {
  return rolloverHour;
}

export function setRolloverHourCache(h) {
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0 && n <= 23) rolloverHour = n;
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Logical day for an instant: shift back by the rollover hour, then format
// as a LOCAL date. 1am with a 4am rollover belongs to yesterday.
export function logicalDay(ts = Date.now()) {
  return fmt(new Date(ts - rolloverHour * HOUR_MS));
}

// Parse 'YYYY-MM-DD' at local noon — immune to DST edges.
export function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

// b - a in whole days. Positive when b is after a.
export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}

export const BACKFILL_DAYS = 2;

// Today, yesterday and the day before are editable; older is read-only.
export function isEditableDay(day) {
  const today = logicalDay();
  const diff = daysBetween(day, today);
  return diff >= 0 && diff <= BACKFILL_DAYS;
}

// End of a logical day as epoch ms (start of next logical day).
export function dayEndMs(day) {
  const d = parseDay(day);
  d.setHours(24 + rolloverHour, 0, 0, 0);
  return d.getTime();
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDay(day) {
  const today = logicalDay();
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const d = parseDay(day);
  return `${WEEKDAY[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function monthLabel(year, month /* 0-based */) {
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][month]} ${year}`;
}
