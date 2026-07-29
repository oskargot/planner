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
