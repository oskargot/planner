// Client-side JSON export/import (§9). Works entirely from IndexedDB, so it
// works when the server is gone — that's the point.

import { db, SYNC_TABLES } from './db.js';
import { scheduleSync } from './sync.js';

export async function exportJSON() {
  const dump = { format: 'planner-backup', version: 1, exported_at: Date.now(), tables: {} };
  for (const t of SYNC_TABLES) {
    dump.tables[t] = await db.table(t).toArray();
  }
  dump.tables.meta = (await db.meta.toArray()).filter((r) => r.key !== 'sync_cursor');

  const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `planner-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Merge, row by row, last-write-wins — same rule as sync. Never wipes local
// data that's newer than the backup.
export async function importJSON(file) {
  const text = await file.text();
  const dump = JSON.parse(text);
  if (dump.format !== 'planner-backup' || !dump.tables) {
    throw new Error('Not a planner backup file');
  }
  let applied = 0;
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
    for (const t of SYNC_TABLES) {
      for (const incoming of dump.tables[t] || []) {
        if (!incoming?.id) continue;
        const local = await db.table(t).get(incoming.id);
        if (!local || incoming.updated_at >= local.updated_at) {
          await db.table(t).put(incoming);
          applied++;
        }
      }
    }
    for (const incoming of dump.tables.meta || []) {
      if (!incoming?.key || incoming.key === 'sync_cursor') continue;
      const local = await db.meta.get(incoming.key);
      if (!local || incoming.updated_at >= local.updated_at) {
        await db.meta.put(incoming);
        applied++;
      }
    }
  });
  scheduleSync();
  return applied;
}
