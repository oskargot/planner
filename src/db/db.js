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

// Tables that participate in sync (meta is handled specially — only
// day_rollover_hour syncs; sync_cursor/theme/motion stay local).
export const SYNC_TABLES = [
  'tasks',
  'habits',
  'habit_entries',
  'projects',
  'milestones',
  'project_touches',
  'shop_items',
  'purchases',
  'ledger',
];

export const SYNCED_META_KEYS = ['day_rollover_hour'];

export const uuid = () => crypto.randomUUID();

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
    theme: (await getMeta('theme')) || 'paper',
    motion: (await getMeta('motion')) !== 'off',
    rolloverHour: h !== null ? Number(h) : 4,
  };
}
