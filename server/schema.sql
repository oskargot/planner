-- Mirrors §4 of the spec. Synced tables all carry id / created_at /
-- updated_at / deleted; rows are tombstoned, never hard-deleted.

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  size        TEXT NOT NULL,
  notes       TEXT,
  color       TEXT,                -- accent index '1'..'6', NULL = auto
  done_at     INTEGER,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);

-- A checklist inside a task. Worth 0 points, exactly like milestones: these
-- are structure, and paying for them would make "one task, ten subtasks" the
-- cheapest way to farm the ledger.
CREATE TABLE IF NOT EXISTS subtasks (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  done_at     INTEGER,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_updated ON subtasks(updated_at);

CREATE TABLE IF NOT EXISTS habits (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT,
  color       TEXT,                -- accent index '1'..'6', NULL = auto
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_habits_updated ON habits(updated_at);

CREATE TABLE IF NOT EXISTS habit_entries (
  id          TEXT PRIMARY KEY,
  habit_id    TEXT NOT NULL,
  day         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_day ON habit_entries(habit_id, day);
CREATE INDEX IF NOT EXISTS idx_habit_entries_updated ON habit_entries(updated_at);

-- Chores: recurring quest-like work on a COOLDOWN, deliberately not a
-- schedule. Doing one starts its rest; after interval_days it is simply
-- "ready" again and waits forever. There is no due date and no overdue state
-- anywhere — a chore can be ready, never late. Same day-scoped entry shape as
-- habit_entries, same unique index, same merge rule.
CREATE TABLE IF NOT EXISTS chores (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  emoji         TEXT,
  color         TEXT,                -- accent index '1'..'6', NULL = auto
  size          TEXT NOT NULL DEFAULT 'S',
  interval_days INTEGER NOT NULL DEFAULT 7,
  sort_order    REAL NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chores_updated ON chores(updated_at);

CREATE TABLE IF NOT EXISTS chore_entries (
  id          TEXT PRIMARY KEY,
  chore_id    TEXT NOT NULL,
  day         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chore_day ON chore_entries(chore_id, day);
CREATE INDEX IF NOT EXISTS idx_chore_entries_updated ON chore_entries(updated_at);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at);

CREATE TABLE IF NOT EXISTS milestones (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  done_at     INTEGER,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_milestones_updated ON milestones(updated_at);

CREATE TABLE IF NOT EXISTS project_touches (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  day         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_day ON project_touches(project_id, day);
CREATE INDEX IF NOT EXISTS idx_project_touches_updated ON project_touches(updated_at);

CREATE TABLE IF NOT EXISTS shop_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  notes       TEXT,
  image_url   TEXT,
  sold_out    INTEGER NOT NULL DEFAULT 0,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shop_items_updated ON shop_items(updated_at);

CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  shop_item_id  TEXT,
  name_snapshot TEXT NOT NULL,
  cost_snapshot INTEGER NOT NULL,
  purchased_at  INTEGER NOT NULL,
  redeemed_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_purchases_updated ON purchases(updated_at);

CREATE TABLE IF NOT EXISTS ledger (
  id          TEXT PRIMARY KEY,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  source_type TEXT,
  source_id   TEXT,
  day         TEXT NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ledger_day ON ledger(day);
CREATE INDEX IF NOT EXISTS idx_ledger_updated ON ledger(updated_at);

CREATE TABLE IF NOT EXISTS meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- The tumbler (§ the rock shop). A separate economy: grit never touches the
-- points ledger above, and these tables never appear in a points query.
-- tumbler_ledger is append-only in exactly the same way `ledger` is — the grit
-- balance AND the upgrade levels are both derived from its rows, so two
-- devices spending offline merge instead of clobbering a counter.

CREATE TABLE IF NOT EXISTS tumbler_barrels (
  id          TEXT PRIMARY KEY,
  slot        INTEGER NOT NULL,
  cycle_key   TEXT,
  seed        TEXT,
  species     TEXT,               -- outcome is decided at load time, not at
  grade       INTEGER,            -- open time, so it can't be rerolled
  started_at  INTEGER,            -- NULL = idle
  duration_ms INTEGER NOT NULL DEFAULT 0,
  collected_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tumbler_barrels_updated ON tumbler_barrels(updated_at);

CREATE TABLE IF NOT EXISTS gems (
  id          TEXT PRIMARY KEY,
  seed        TEXT NOT NULL,
  species     TEXT NOT NULL,
  grade       INTEGER NOT NULL,
  cycle_key   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0   -- crushed; the row stays as the log
);
CREATE INDEX IF NOT EXISTS idx_gems_updated ON gems(updated_at);

CREATE TABLE IF NOT EXISTS tumbler_ledger (
  id          TEXT PRIMARY KEY,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,      -- 'crush' | 'upgrade'
  upgrade_key TEXT,               -- which upgrade a spend bought; levels are
  note        TEXT,               -- counted from these rows
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tumbler_ledger_updated ON tumbler_ledger(updated_at);

-- The mine. The board itself is a pure function of mine_seed and is never
-- stored; this is only the ground you've uncovered, as bitmasks over 16x16
-- chunks. One row per chunk rather than per cell, because the board is
-- infinite and a row per dug cell would be thousands of rows carrying one bit
-- each.
--
-- The id is DERIVED ('mine:<seed>:<cx>:<cy>'), not a uuid, so two devices
-- digging the same patch offline write the same row and merge by LWW instead
-- of needing a unique index and a merge rule. Prestige rerolls mine_seed,
-- which namespaces every id — the old chunks are tombstoned on reset rather
-- than left to accumulate.

CREATE TABLE IF NOT EXISTS mine_chunks (
  id          TEXT PRIMARY KEY,
  world_seed  TEXT NOT NULL,
  cx          INTEGER NOT NULL,
  cy          INTEGER NOT NULL,
  dug         TEXT NOT NULL,      -- 256-bit hex mask: ground uncovered
  whole       TEXT NOT NULL,      -- and of those, the gems that came out whole
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mine_chunks_updated ON mine_chunks(updated_at);
