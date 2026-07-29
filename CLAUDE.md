# Binder (name TBD — one constant in `src/config.js`)

Personal planner PWA for Oskar (he/him). Single user, no auth ever — the
tailnet is the security boundary. Tasks, habits, and projects earn points
that get spent in a personal shop. Local-first: IndexedDB (Dexie) is the
source of truth for the UI; a small Hono+SQLite server on `jellybot` (a slow
Debian box on the tailnet) is a sync target and backup point, never a
dependency. The app must work fully offline.

The full v1 spec lives in the original handoff doc; this file is the working
summary. The old app being replaced was "mochi house" — its data was imported
via `scripts/convert-mochi.mjs`.

## Commands

```bash
npm run dev          # Vite dev server, /api proxied to :8790
npm run build        # production build to dist/
npm run server       # sync server (or: node server/index.js)
cd server && npm i   # server deps are a separate package (better-sqlite3)
```

There are no tests or linters wired up. Verification is done by building and
driving the app in a browser (playwright-core + the preinstalled Chromium
works well for screenshots).

## Deploying (jellybot)

- Client change: `git pull && npm run build` on jellybot — that's it. The
  server serves `dist/` from disk; cache headers make devices pick it up on
  next load. Never re-introduce uncached `index.html`/`sw.js` (Safari will
  freeze users on stale builds — this bit us once already).
- Server change: also `sudo systemctl restart planner` (systemd unit runs
  `node server/index.js`; exposed via `tailscale serve --bg 8790`).
- Builds are slow on jellybot's AMD E-350; building elsewhere and copying
  `dist/` is acceptable. Claude Code on jellybot is pinned to v2.1.14
  (`DISABLE_UPDATES`, AVX incompatibility) — do not upgrade it.
- Nightly backup cron runs `server/backup.sh` (sqlite `.backup`, 30 dailies).

## Git

Work happens on `claude/oskar-planner-v1-wqpzus`; `main` is kept
fast-forwarded to it after each push (Oskar pulls `main` on jellybot). Both
pushes every time:

```bash
git push -u origin claude/oskar-planner-v1-wqpzus
git push origin claude/oskar-planner-v1-wqpzus:main
```

## Architecture map

```
src/
  config.js          APP_NAME + declarative NAV (add a page = entry + route)
  db/
    time.js          logicalDay() and ALL date math — never elsewhere
    db.js            Dexie schema, insertRow/updateRow/softDelete, meta
    actions.js       every mutation; the ONLY place ledger rows are written
    selectors.js     balance, earned-today, heat-map ratios, staleness
    sync.js          push/pull loop (LWW on updated_at), debounced 2s
    backup.js        client-side JSON export/import (merge, LWW)
  themes/            _tokens.css is the contract; paper (default) + mono
  components/        NavBar (bottom bar <900px, left rail ≥900px), Card,
                     Check, ColorPicker (itemAccent helper lives here)
  pages/             one file per screen
server/
  index.js           GET/POST /api/sync, LWW upserts, serves dist/, cache
                     headers, additive column migrations (ensureColumn)
  schema.sql         SQLite schema (mirror Dexie when changing either)
scripts/
  convert-mochi.mjs  one-shot mochi-house → planner backup converter
```

## Invariants — do not break these

- **Ledger is append-only** and the only source of truth for points. No
  balance column anywhere. Undo = a second row with negative delta. Deleting
  a completed task reverses its points; deleting habits/projects does NOT.
- **Milestones are worth 0 points** (anti-point-farming, deliberate).
- **Purchases blocked when cost > balance**; only `adjust` may go negative.
- **`day` is a local YYYY-MM-DD string** computed by `logicalDay()` with a
  configurable rollover hour (default 04:00, synced meta
  `day_rollover_hour`). Backfill window: today + 2 days back, older is
  read-only.
- **Soft deletes only** on synced tables (`deleted` tombstone). Client-made
  IDs (uuid). Every write bumps `updated_at` (that's what syncs).
- **Theming: tokens only.** No literal colors/shadows/radii/fonts in
  component CSS — everything through `var(--...)` from `_tokens.css`, themed
  in `paper.css`/`mono.css`. The mono theme exists to prove the contract.
- **Heat-map ratios** divide by habits active *that day* (created_at ≤ day
  end), not today's count — imports must backdate habit `created_at`.
- **No recurring tasks, no task↔project links, no login, no due dates** —
  deliberate v1 non-goals; don't add hooks for them.
- Schema changes: update BOTH `server/schema.sql` (+ `ensureColumn`
  migration + `TABLES` column list in `server/index.js`) and note that Dexie
  needs no version bump for unindexed fields.

## Conventions & taste

- Colors: tasks/habits/projects have `color` = accent index `'1'`–`'6'` as a
  string, NULL = auto (rotating rainbow by list position via `itemAccent`).
  The six pastel accents are the identity of the Paper theme; rainbow as an
  accent system, not a background.
- Motion (confetti, floating +N points, checkbox overshoot) is in `fx.js`,
  always behind `prefers-reduced-motion` AND the settings toggle
  (`data-motion` on `<html>`).
- Boot must never white-screen: `App.jsx` races settings-load against a 4s
  fallback and surfaces errors; `main.jsx` has a global error overlay. Keep
  it that way.
- Oskar iterates by marking up screenshots — send screenshots back after UI
  changes (chromium at 390×844 for phone, ~1180×820 for iPad).
- The sync status dot was removed on request (status text lives in
  Settings). Don't reintroduce ambient indicators without asking.

## Known state / open threads

- Wordmark is placeholder "Binder"; name undecided (§12 of spec).
- Home habits calendar shows the calendar month; a rolling ~5-week window
  was floated as an alternative if early-month emptiness annoys.
- Left rail appears at ≥900px, so iPad portrait gets it too; Oskar hasn't
  confirmed whether portrait should keep the bottom bar instead.
- Oskar's live DB imported before task/habit colors existed, so his rows
  use auto-rainbow unless hand-pinned (re-import would restore mochi colors
  but overwrites edits made since — ask first).
- His timezone assumption for historical imports: America/Chicago.
