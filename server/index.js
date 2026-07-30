// Sync server (§2–3). Node + Hono + better-sqlite3, one database file.
// Binds to localhost only — the tailnet (via `tailscale serve`) is the
// authentication boundary. No auth, no ORM, hand-written SQL.

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.PLANNER_DB || join(__dirname, 'data', 'planner.db');
const PORT = Number(process.env.PORT || 8790);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

// Additive migrations for databases created before a column existed.
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('tasks', 'color', 'color TEXT');
ensureColumn('habits', 'color', 'color TEXT');

// Column lists drive the generated upserts; order matters only for VALUES.
const TABLES = {
  tasks: ['id', 'title', 'size', 'notes', 'color', 'done_at', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  subtasks: ['id', 'task_id', 'title', 'done_at', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  habits: ['id', 'name', 'emoji', 'color', 'active', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  habit_entries: ['id', 'habit_id', 'day', 'created_at', 'updated_at', 'deleted'],
  projects: ['id', 'name', 'description', 'color', 'status', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  milestones: ['id', 'project_id', 'title', 'done_at', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  project_touches: ['id', 'project_id', 'day', 'created_at', 'updated_at', 'deleted'],
  shop_items: ['id', 'name', 'cost', 'notes', 'image_url', 'sold_out', 'sort_order', 'created_at', 'updated_at', 'deleted'],
  purchases: ['id', 'shop_item_id', 'name_snapshot', 'cost_snapshot', 'purchased_at', 'redeemed_at', 'created_at', 'updated_at', 'deleted'],
  ledger: ['id', 'delta', 'reason', 'source_type', 'source_id', 'day', 'note', 'created_at', 'updated_at', 'deleted'],
  // The tumbler's three. Same shape rules as everything else; they just never
  // mix with the points tables above.
  tumbler_barrels: ['id', 'slot', 'cycle_key', 'seed', 'species', 'grade', 'started_at', 'duration_ms', 'collected_at', 'created_at', 'updated_at', 'deleted'],
  gems: ['id', 'seed', 'species', 'grade', 'cycle_key', 'created_at', 'updated_at', 'deleted'],
  tumbler_ledger: ['id', 'delta', 'reason', 'upgrade_key', 'note', 'created_at', 'updated_at', 'deleted'],
};

// Only these meta keys sync; everything else in meta is device-local.
const SYNCED_META_KEYS = ['day_rollover_hour'];

const pull = {};
const upsert = {};
for (const [table, cols] of Object.entries(TABLES)) {
  pull[table] = db.prepare(`SELECT * FROM ${table} WHERE updated_at > ?`);
  const sets = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  // LWW: apply only if the incoming write is at least as new (§3).
  upsert[table] = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${sets} WHERE excluded.updated_at >= ${table}.updated_at`
  );
}

const pullMeta = db.prepare(
  `SELECT key, value, updated_at FROM meta WHERE updated_at > ? AND key IN (${SYNCED_META_KEYS.map(() => '?').join(',')})`
);
const upsertMeta = db.prepare(
  `INSERT INTO meta (key, value, updated_at) VALUES (@key, @value, @updated_at)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
   WHERE excluded.updated_at >= meta.updated_at`
);

// Day-scoped tables have a UNIQUE(x, day) index. Two devices can mint rows
// with different ids for the same (x, day) while offline; on collision, merge
// into the existing row by LWW instead of failing the batch.
const dayConflict = {
  habit_entries: {
    find: db.prepare('SELECT * FROM habit_entries WHERE habit_id = ? AND day = ?'),
    update: db.prepare('UPDATE habit_entries SET deleted = @deleted, updated_at = @updated_at WHERE habit_id = @habit_id AND day = @day AND updated_at <= @updated_at'),
    keys: ['habit_id', 'day'],
  },
  project_touches: {
    find: db.prepare('SELECT * FROM project_touches WHERE project_id = ? AND day = ?'),
    update: db.prepare('UPDATE project_touches SET deleted = @deleted, updated_at = @updated_at WHERE project_id = @project_id AND day = @day AND updated_at <= @updated_at'),
    keys: ['project_id', 'day'],
  },
};

function applyRow(table, row) {
  const cols = TABLES[table];
  const clean = {};
  for (const c of cols) clean[c] = row[c] ?? null;
  try {
    upsert[table].run(clean);
    return 1;
  } catch (e) {
    const dc = dayConflict[table];
    if (dc && String(e.message).includes('UNIQUE')) {
      dc.update.run(clean);
      return 1;
    }
    throw e;
  }
}

const applyChanges = db.transaction((changes) => {
  let applied = 0;
  for (const [table, rows] of Object.entries(changes)) {
    if (table === 'meta') {
      for (const row of rows) {
        if (!SYNCED_META_KEYS.includes(row.key)) continue;
        upsertMeta.run({ key: row.key, value: String(row.value), updated_at: row.updated_at });
        applied++;
      }
      continue;
    }
    if (!TABLES[table]) continue;
    for (const row of rows) {
      if (!row?.id) continue;
      applied += applyRow(table, row);
    }
  }
  return applied;
});

const app = new Hono();

app.get('/api/sync', (c) => {
  const since = Number(c.req.query('since') || 0);
  const changes = {};
  for (const table of Object.keys(TABLES)) {
    const rows = pull[table].all(since);
    if (rows.length) changes[table] = rows;
  }
  const metaRows = pullMeta.all(since, ...SYNCED_META_KEYS);
  if (metaRows.length) changes.meta = metaRows;
  return c.json({ now: Date.now(), changes });
});

app.post('/api/sync', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad json' }, 400);
  }
  if (!body?.changes || typeof body.changes !== 'object') {
    return c.json({ error: 'missing changes' }, 400);
  }
  const applied = applyChanges(body.changes);
  return c.json({ now: Date.now(), applied });
});

app.get('/api/health', (c) => c.json({ ok: true }));

// Cache policy: hashed assets are immutable; everything else (index.html,
// sw.js, manifest) must revalidate every time or Safari happily serves a
// stale app shell and updates never land.
app.use('*', async (c, next) => {
  await next();
  if (c.req.path.startsWith('/api/')) return;
  if (c.req.path.startsWith('/assets/')) {
    c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    c.res.headers.set('Cache-Control', 'no-cache');
  }
});

// Production: serve the built client from ../dist, SPA-fallback to index.html.
// serveStatic paths are cwd-relative, so anchor them to this file's location.
const DIST = relative(process.cwd(), join(__dirname, '..', 'dist')) || '.';
app.use('/*', serveStatic({ root: DIST }));
app.get('*', serveStatic({ path: join(DIST, 'index.html') }));

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`planner server on http://127.0.0.1:${info.port} (db: ${DB_PATH})`);
});
