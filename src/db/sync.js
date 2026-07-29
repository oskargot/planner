// Sync loop (§3). Last-write-wins per record on updated_at. Push dirty rows,
// pull changes, advance the cursor to the server's clock. Failures are silent;
// the UI only ever sees the little status dot.

import { db, SYNC_TABLES, SYNCED_META_KEYS, getMeta, setMeta, setOnWrite } from './db.js';
import { setRolloverHourCache } from './time.js';
import { useSyncExternalStore } from 'react';

const API = import.meta.env.VITE_API_URL || '';

let status = 'idle'; // idle | syncing | synced | offline | error
const listeners = new Set();

function setStatus(s) {
  status = s;
  listeners.forEach((fn) => fn());
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status
  );
}

let syncing = false;
let queued = false;

export async function syncNow() {
  if (syncing) {
    queued = true;
    return;
  }
  syncing = true;
  setStatus('syncing');
  try {
    const cursor = Number((await getMeta('sync_cursor')) || 0);

    // push: everything written since the cursor
    const changes = {};
    for (const t of SYNC_TABLES) {
      const rows = await db.table(t).where('updated_at').above(cursor).toArray();
      if (rows.length) changes[t] = rows;
    }
    const metaRows = [];
    for (const key of SYNCED_META_KEYS) {
      const row = await db.meta.get(key);
      if (row && row.updated_at > cursor) metaRows.push(row);
    }
    if (metaRows.length) changes.meta = metaRows;

    if (Object.keys(changes).length) {
      const res = await fetch(`${API}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) throw new Error(`push ${res.status}`);
    }

    // pull
    const res = await fetch(`${API}/api/sync?since=${cursor}`);
    if (!res.ok) throw new Error(`pull ${res.status}`);
    const data = await res.json();

    await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
      for (const t of SYNC_TABLES) {
        for (const incoming of data.changes?.[t] || []) {
          const local = await db.table(t).get(incoming.id);
          if (!local || incoming.updated_at >= local.updated_at) {
            await db.table(t).put(incoming); // raw put: no dirty-marking
          }
        }
      }
      for (const incoming of data.changes?.meta || []) {
        if (!SYNCED_META_KEYS.includes(incoming.key)) continue;
        const local = await db.meta.get(incoming.key);
        if (!local || incoming.updated_at >= local.updated_at) {
          await db.meta.put(incoming);
          if (incoming.key === 'day_rollover_hour') setRolloverHourCache(incoming.value);
        }
      }
    });

    await setMetaLocal('sync_cursor', data.now);
    setStatus('synced');
  } catch (e) {
    setStatus(navigator.onLine === false ? 'offline' : 'error');
  } finally {
    syncing = false;
    if (queued) {
      queued = false;
      scheduleSync();
    }
  }
}

// sync_cursor is local-only meta; write it without triggering another sync.
async function setMetaLocal(key, value) {
  await db.meta.put({ key, value: String(value), updated_at: Date.now() });
}

let debounceTimer = null;
export function scheduleSync() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncNow, 2000); // debounced ~2s after any write
}

export function startSync() {
  setOnWrite(scheduleSync);
  syncNow(); // on load
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('focus', syncNow);
  setInterval(syncNow, 60000); // every 60s while open
}
