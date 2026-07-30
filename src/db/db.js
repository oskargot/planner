import Dexie from 'dexie';
import { setRolloverHourCache } from './time.js';

// Mirrors the SQLite schema (§4). Indexes: updated_at everywhere (sync),
// plus what each screen queries by.
export const db = new Dexie('planner');

db.version(1).stores({
  tasks: 'id, updated_at, done_at, sort_order',
  habits: 'id, updated_at, sort_order',
  habit_entries: 'id, updated_at, day, [habit_id+day]',
  projects: 'id, updated_at, status, sort_order',
  milestones: 'id, updated_at, project_id',
  project_touches: 'id, updated_at, day, [project_id+day]',
  shop_items: 'id, updated_at, sort_order',
  purchases: 'id, updated_at, purchased_at',
  ledger: 'id, updated_at, day, created_at',
  meta: 'key',
});

// v2 adds the tumbler (§ the rock shop). New object stores need a version
// bump — only new *unindexed fields* on an existing store don't.
db.version(2).stores({
  tumbler_barrels: 'id, updated_at, slot',
  gems: 'id, updated_at, created_at, species',
  tumbler_ledger: 'id, updated_at, created_at',
});

// v3 adds subtasks — a checklist inside a task, hidden behind its disclosure.
db.version(3).stores({
  subtasks: 'id, updated_at, task_id, sort_order',
});

// v4 adds the mine. One row per 16×16 chunk of dug ground, not per cell — the
// board is infinite, and a row per cell would be thousands of synced rows to
// say one bit each. The id is derived (see db/mine.js), so there's no reason
// to index the coordinates: every lookup is a primary-key get.
db.version(4).stores({
  mine_chunks: 'id, updated_at',
});

// Tables that participate in sync (meta is handled specially — only
// day_rollover_hour syncs; sync_cursor/theme/motion stay local).
export const SYNC_TABLES = [
  'tasks',
  'subtasks',
  'habits',
  'habit_entries',
  'projects',
  'milestones',
  'project_touches',
  'shop_items',
  'purchases',
  'ledger',
  'tumbler_barrels',
  'gems',
  'tumbler_ledger',
  'mine_chunks',
];

// mine_seed can't be derived from anything the way the prestige level can, so
// it has to sync as meta and takes LWW. Worst case if two devices ever
// disagree: an unfamiliar board. No stone and no grit is at risk either way.
export const SYNCED_META_KEYS = ['day_rollover_hour', 'mine_seed'];

// crypto.randomUUID needs Safari 15.4+; fall back to getRandomValues.
export const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

// sync.js registers itself here so every local write schedules a push,
// without a circular import.
let onWrite = null;
export function setOnWrite(fn) {
  onWrite = fn;
}
function wrote() {
  if (onWrite) onWrite();
}

// Create a new synced row with the standard columns.
export async function insertRow(table, fields) {
  const now = Date.now();
  const row = { id: uuid(), created_at: now, updated_at: now, deleted: 0, ...fields };
  await db.table(table).put(row);
  wrote();
  return row;
}

/*
 * Same as insertRow, but with a caller-supplied id. Only for tables whose ids
 * are DERIVED rather than random — currently just mine_chunks, where two
 * devices digging the same patch offline have to produce the same row id so
 * LWW merges them instead of minting two rows for one chunk.
 */
export async function insertRowWithId(table, id, fields) {
  const now = Date.now();
  const row = { id, created_at: now, updated_at: now, deleted: 0, ...fields };
  await db.table(table).put(row);
  wrote();
  return row;
}

// Update an existing synced row, bumping updated_at.
export async function updateRow(table, id, fields) {
  await db.table(table).update(id, { ...fields, updated_at: Date.now() });
  wrote();
}

// Tombstone, never hard-delete (§3).
export async function softDelete(table, id) {
  await updateRow(table, id, { deleted: 1 });
}

// ---- meta ----

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value: String(value), updated_at: Date.now() });
  if (SYNCED_META_KEYS.includes(key)) wrote();
}

// Boot-time load of settings the rest of the app caches.
export async function loadSettings() {
  const h = await getMeta('day_rollover_hour');
  if (h !== null) setRolloverHourCache(h);
  return {
    // 'auto' by default: a planner that's open at 1am shouldn't be the thing
    // that wakes you up. See theme.js for how the preference resolves.
    theme: (await getMeta('theme')) || 'auto',
    motion: (await getMeta('motion')) !== 'off',
    rolloverHour: h !== null ? Number(h) : 4,
  };
}
