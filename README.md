# Binder (name TBD)

A personal planner: tasks, habits, and project tracking with a points economy
that pays out into a personal shop. Local-first PWA — every read and write hits
IndexedDB first; a small sync server on jellybot is the merge point and backup
target, never a dependency. If the server is down the app works fully and
syncs when it comes back.

Full spec: see the handoff document. Short version of the rules:

- Tasks are S/M/L → 3/5/8 points. Habits and project touches are 1 point per
  day. Milestones are structure, worth 0.
- The ledger is append-only and the only source of truth for points. Undo
  writes a negative row; nothing is ever edited or deleted.
- Days roll over at 04:00 (configurable). Habits/touches can be backfilled 2
  days; older days are read-only.
- No accounts, no auth — the tailnet is the boundary.

## Layout

```
src/
  config.js        nav config (add a page = add an entry) + app name
  db/
    time.js        logicalDay() and ALL date math
    db.js          Dexie schema, row helpers, meta
    actions.js     every mutation + the ledger rules
    selectors.js   balance, heat-map stats, staleness
    sync.js        push/pull loop, status
    backup.js      JSON export/import (fully client-side)
  themes/
    _tokens.css    the token contract — every visual value in the app
    paper.css      default skin
    mono.css       minimal proof-of-tokens skin
  pages/           one file per screen
server/
  index.js         Hono + better-sqlite3, GET/POST /api/sync, serves dist/
  schema.sql       SQLite schema
  backup.sh        nightly .backup rotation (30 dailies)
```

## Development

```bash
npm install
npm run dev            # client on :5173, /api proxied to :8790
cd server && npm install && npm start   # sync server on 127.0.0.1:8790
```

The client works with no server at all — sync just stays "offline".

On jellybot (dev over the tailnet):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
tailscale serve --bg 5173
# → https://jellybot.<tailnet>.ts.net
```

Set `VITE_API_URL` (see `.env.example`) if the client should talk to a
server that isn't same-origin.

## Production on jellybot

```bash
npm run build                  # slow on the E-350; building on the desktop
                               # and copying dist/ over is fine
cd server && npm install --omit=dev
node index.js                  # binds 127.0.0.1:8790, serves ../dist + /api
tailscale serve --bg 8790
```

HTTPS via `tailscale serve` is required — iOS won't register a service worker
or install a PWA over plain HTTP.

Env vars: `PLANNER_DB` (default `server/data/planner.db`), `PORT` (8790),
`PLANNER_BACKUP_DIR` (default `server/data/backups`).

## Backups

Three layers (§9 of the spec):

1. Nightly cron on jellybot — needs the `sqlite3` CLI installed:
   ```
   30 4 * * * /path/to/planner/server/backup.sh
   ```
   Uses `.backup` (not `cp` — copying a live SQLite file can tear), keeps 30
   dailies.
2. **Export JSON** in Settings / Shop → Ledger: dumps every table from
   IndexedDB, entirely client-side.
3. **Import JSON** accepts that file back and merges last-write-wins. Tested:
   export → wipe IndexedDB → import restores everything.

## Theming

Every visual value is a CSS custom property defined in
`src/themes/_tokens.css` and skinned per-theme. To add a theme: copy
`mono.css`, change the values, import it in `main.jsx`, add it to the list in
`src/pages/Settings.jsx`. Component CSS must never contain a literal color,
shadow, radius, font, or texture.

## Sync protocol

Last-write-wins per record on `updated_at`, tombstones for deletes.

```
GET  /api/sync?since=<epoch_ms>   → { now, changes: { table: [rows…] } }
POST /api/sync { changes }        → { now, applied }
```

The client pushes rows dirty since its cursor, pulls, then advances the
cursor to the server's `now`. Runs on load, focus, reconnect, every 60s, and
debounced ~2s after any write. Failures are silent (dot in the corner).

## Notes for this box

- Claude Code on jellybot is pinned to v2.1.14 with `DISABLE_UPDATES` set
  (AVX incompatibility). Don't upgrade it.
- The E-350 is slow; prefer building elsewhere.
