# Planner (`APP_NAME` in `src/config.js`)

Personal planner PWA for Oskar (he/him). Single user, no auth ever — the
tailnet is the security boundary. Tasks, habits, and projects earn points
that get spent in a personal shop. A separate idle game (the tumbler) runs
on its own currency and deliberately does not connect to any of that. Local-first: IndexedDB (Dexie) is the
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

```bash
npm run build && node scripts/shots.mjs [outdir]   # every screen, phone + iPad
```

There are no tests or linters wired up. Verification is building, then driving
the app in a browser. `scripts/shots.mjs` is the harness for that: it serves
`dist/`, seeds a realistic IndexedDB through the raw indexedDB API, and shoots
every screen at 390×844 and 1180×820. It is dev-only — nothing in `src/`
imports it.

## Deploying (jellybot)

Automatic: push to `main` → `.github/workflows/build.yml` builds the client and
force-pushes `dist/` to the `deploy` branch → `planner-update.timer` on
jellybot picks it up within five minutes (`deploy/update.sh`). Full setup and
troubleshooting in `deploy/README.md`.

- The build runs on GitHub's runner, never on jellybot — the AMD E-350 takes
  minutes to run Vite, which is why deploying by hand was avoidable work.
- **jellybot pulls; GitHub never reaches in.** No tailnet credential is stored
  on GitHub, deliberately: the app has no auth of its own, so the tailnet is
  the entire security boundary and CI is not invited inside it.
- The updater swaps a `dist` → `releases/<sha>` symlink with an atomic rename;
  it never writes into a live `dist/`. A half-written directory can serve an
  `index.html` referencing assets that aren't there yet, and index.html is
  no-cache while assets are immutable, so devices cache the broken pairing.
  Never re-introduce uncached `index.html`/`sw.js` either (Safari will freeze
  users on stale builds — this bit us once already).
- Restarts only happen when `server/**` changed; a client-only change is just
  the symlink swap, with no dropped sync requests. `server/package.json`
  changes trigger `npm i` first (better-sqlite3 is native and slow there).
- Anything that looks wrong — missing `index.html`/`assets`/`sw.js`, diverged
  local `main`, failed `npm i` — aborts WITHOUT swapping. Leaving the old build
  serving always beats an unattended white-screen.
- Manual fallback, still fine: `git pull && npm run build`, plus
  `sudo systemctl restart planner` for server changes (systemd unit runs
  `node server/index.js`; exposed via `tailscale serve --bg 8790`). Stop the
  automation with `sudo systemctl disable --now planner-update.timer`.
- Claude Code on jellybot is pinned to v2.1.14 (`DISABLE_UPDATES`, AVX
  incompatibility) — do not upgrade it.
- Nightly backup cron runs `server/backup.sh` (sqlite `.backup`, 30 dailies).

## Git

`main` is what Oskar pulls on jellybot, and it's kept fast-forwarded to
whatever the current working branch is after each push. Current branch is
`claude/planner-redesign-features-tmhiy4` (palette + long-press + tumbler);
before it were `claude/iphone-planner-redesign-p6fw8r` (the iPhone pass) and
`claude/oskar-planner-v1-wqpzus` (v1). Both pushes every time:

```bash
git push -u origin claude/planner-redesign-features-tmhiy4
git push origin claude/planner-redesign-features-tmhiy4:main
```

## Architecture map

```
src/
  config.js          APP_NAME + declarative NAV (add a page = entry + route)
  greeting.js        pure: time-of-day hello + the ranked flavor lines
  useLongPress.js    hold-to-edit gesture (iOS callout/selection suppression)
  db/
    time.js          logicalDay() and ALL date math — never elsewhere
    db.js            Dexie schema, insertRow/updateRow/softDelete, meta
    actions.js       every POINTS mutation (tasks, subtasks, habits,
                     projects, shop); only place `ledger` is written
    tumbler.js       every GRIT mutation; only place `tumbler_ledger` is
                     written. Never touches points, and vice versa.
    selectors.js     balance, earned-today, heat ratios, staleness,
                     useGreetingState (one snapshot for the Home line)
    sync.js          push/pull loop (LWW on updated_at), debounced 2s
    backup.js        client-side JSON export/import (merge, LWW)
  themes/            _tokens.css is the contract; paper (default) + mono
  components/        NavBar (bottom bar <900px; ≥900px an icon rail plus a
                     separate sub-page column beside it), Card,
                     Check, ColorPicker (itemAccent helper lives here),
                     Icon (the whole inline-SVG glyph set)
  tumbler/
    gems.js          pure generation: species, grades, cycles, odds, geometry
    Gem.jsx          the SVG renderer (dumb; all maths lives in gems.js)
  pages/             one file per screen
server/
  index.js           GET/POST /api/sync, LWW upserts, serves dist/, cache
                     headers, additive column migrations (ensureColumn)
  schema.sql         SQLite schema (mirror Dexie when changing either)
scripts/
  convert-mochi.mjs  one-shot mochi-house → planner backup converter
  shots.mjs          dev-only screenshot harness (seeds its own IndexedDB)
```

## Invariants — do not break these

- **Ledger is append-only** and the only source of truth for points. No
  balance column anywhere. Undo = a second row with negative delta. Deleting
  a completed task reverses its points; deleting habits/projects does NOT.
- **Points and grit never mix.** The tumbler is a separate economy: no task
  earns grit, no gem buys a shop item, and neither ledger is ever read by the
  other side. `tumbler_ledger` follows the same append-only rule — the grit
  balance AND the upgrade levels are both derived from its rows, because a
  plain counter synced LWW loses spend when two devices are offline.
- **Milestones and subtasks are worth 0 points** (anti-point-farming,
  deliberate). Both are structure inside something else; paying per subtask
  would make "one task, ten subtasks" the cheapest way to farm the ledger.
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
- **`--accent-N` is a pale pastel and is NOT readable as text.** Anything that
  paints an accent AS a glyph or letters uses `--accent-N-ink`; anything that
  puts ink ON an accent fill (the checkbox tick) uses `--on-accent`. Painting
  a rainbow into text takes `--gradient-rainbow-ink`, not the pastel sweep.
- **Gradients are decoration, never meaning.** The `--gradient-*` and
  awning/shelf tokens exist so Mono can collapse them all to flat ink; if a
  screen stops making sense under Mono, something meaningful was hiding in
  decoration. Nothing may be conveyed by a gradient alone.
- **App chrome uses `Icon.jsx`, not emoji.** Unicode symbols look like five
  different icon sets on iOS (missing glyphs, mismatched fallback-font
  metrics) — U+FE0E and `font-variant-emoji` don't fix either. User-supplied
  emoji (habit `emoji`) is data and stays as-is.
- **Heat-map ratios** divide by habits active *that day* (created_at ≤ day
  end), not today's count — imports must backdate habit `created_at`.
- **No recurring tasks, no task↔project links, no login, no due dates** —
  deliberate v1 non-goals; don't add hooks for them.
- **On a task row, tap opens its subtask drawer and hold opens the editor.**
  A completed long press also fires a click on release, so the tap handler
  checks `consumedRef` from `useLongPress` or the drawer opens behind the
  editor. One drawer open at a time — the open id lives on the list, not the
  row, because opening one closes another.
- **Editing is a long press, never a visible control.** Shop boxes, task rows,
  habit rows and shelf gems all use `useLongPress`; a primary action inside a
  long-press target (checkbox, price tag) must `stopPropagation` on
  `pointerdown` or a hold will fire both. Each such screen carries one quiet
  `.longpress-hint` line, which is the whole discoverability budget.
- Schema changes: update BOTH `server/schema.sql` (+ `ensureColumn`
  migration + `TABLES` column list in `server/index.js`) and note that Dexie
  needs no version bump for unindexed fields — but DOES need one for a new
  object store (that's what `db.version(2)` is).

## Conventions & taste

- Colors: tasks/habits/projects have `color` = accent index `'1'`–`'6'` as a
  string, NULL = auto (rotating rainbow by list position via `itemAccent`).
  The six bright pastels are the identity of the Paper theme; rainbow as an
  accent system, not a background. The page is a faintly cool off-white — it
  was warm cream through v1 and the whole app read as sepia; do not drift it
  back toward yellow.
- The tap ripple is TWO thin rings, the second delayed 110ms, over a RADIAL
  rainbow: each ring's mask radius decides which band of the spectrum it picks
  up, so the two come out different colours from one gradient. That's why the
  masks sit at different radii — it isn't only about the stagger.
- Motion (confetti, floating +N points, checkbox overshoot, the rainbow tap
  ripple) is in `fx.js`, always behind `prefers-reduced-motion` AND the
  settings toggle (`data-motion` on `<html>`). The tap ripple is one
  document-level `pointerdown` listener installed from `main.jsx` — global on
  purpose, so no component has to remember to wire it up.
- Boot must never white-screen: `App.jsx` races settings-load against a 4s
  fallback and surfaces errors; `main.jsx` has a global error overlay. Keep
  it that way.
- Oskar iterates by marking up screenshots — send screenshots back after UI
  changes (chromium at 390×844 for phone, ~1180×820 for iPad).
- The sync status dot was removed on request (status text lives in
  Settings). Don't reintroduce ambient indicators without asking.
- The Home greeting's second line must come from real data or not appear at
  all — `greeting.js` returns null rather than inventing encouragement. A
  generic line you stop reading after a week is worse than a blank row.

## The tumbler (the idle game)

Load a barrel, walk away, come back to a stone. The rules that keep it from
becoming another chore, in priority order: nothing expires, nothing decays, a
finished barrel waits forever, and the only thing real time buys is better
odds. If a change would create a reason to feel late, it's the wrong change.

- **A barrel's outcome is decided at LOAD time**, stashed on the row, and only
  revealed when opened. Not rolled on open — that way syncing a finished
  barrel to another device yields the same stone and there is no way to reroll
  a bad result by collecting it somewhere else.
- **Barrel state is pure arithmetic** on `started_at + duration_ms`. There is
  no tick to miss, so any amount of time with the app closed is correct.
- **The collection log is separate from the shelf.** A discovery is recorded by
  the `gems` row existing — tombstones included — so crushing a stone can never
  cost you a square. That's what makes crushing a duplicate a free decision.
- Balance knobs all live in `tumbler/gems.js` (`CYCLES`, `rollGrade`,
  `rollSpecies`, `GRADES[].grit`) and `db/tumbler.js` (`UPGRADES`).
- Gem identity (species/grade/name) is STORED on the row; only the drawing is
  derived from the seed. Retuning the facet maths redraws old gems but can
  never re-grade them.
- `color-mix()` with a percentage outside 0–100 is invalid, and an invalid fill
  on an SVG polygon renders BLACK. That showed up as one random black facet on
  high-grade stones — every ratio goes through `mix()` in `gems.js` now.

## Known state / open threads

- Named "Planner" as of this branch (wordmark, title, PWA manifest). Still a
  plain descriptive name rather than the one from §12 if he ever picks one.
- The tumbler's numbers are a first pass, tuned by reasoning rather than by
  play. Expect Oskar to want the early game faster or the upgrades cheaper
  once he's lived with it for a week.
- Home habits calendar shows the calendar month; a rolling ~5-week window
  was floated as an alternative if early-month emptiness annoys.
- Home is one card per row on a phone and TWO columns above 700px: habits →
  studio → inventory on the left, tasks → rocks on the right, placed by
  explicit `grid-column` so the DOM keeps the phone's reading order. It was
  three columns until Oskar's iPad markup; at a third of the width no card
  could say much, and the habits calendar had nowhere to put its list. The
  habits card now splits calendar-left / rows-right at every width.
- The store's awning + shelf cabinet is ported from mochi house. Its tokens
  have now been recolored twice: warm-wood brown → cream → the current cool
  lilac-grey, each time because the furniture fought the page color. The
  tumbler's shelf reuses the same furniture on purpose. Boxes per shelf is a real number from a matchMedia hook,
  not CSS auto-fill — each shelf draws its own plank, so the planks have to
  line up with actual rows.
- `-webkit-line-clamp` needs a non-positioned element: absolute positioning
  blockifies `display: -webkit-box` and silently drops the clamp. That's why
  `.box-name` clamps an inner `<span>`.
- Oskar picked the rainbow ripple for the tap effect; the sparkle-stars and
  bubble variants were the runners-up if he wants to swap.
- Left rail appears at ≥900px, so iPad portrait gets it too; Oskar hasn't
  confirmed whether portrait should keep the bottom bar instead.
- The rail is a fixed icon column plus a 52px gutter the sub-page tabs render
  into, absolutely positioned beside the section they belong to and centred on
  it. Their labels are `writing-mode: vertical-rl` — that's what makes them
  fit, since a horizontal "Collection" needed a 116px panel of its own. Out of
  flow on purpose: the section icons must never move. Note `.nav-rail` carries
  no `overflow` property, because a non-visible overflow on either axis forces
  the other to clip and would slice the sub-tabs off.
- The page bloom needs its fade-to-page-color layer in `base.css`. It's a
  165deg gradient in a wide short tile, so its stops don't line up with the
  tile's bottom edge and it left a faint horizontal seam across every page.
- Oskar's live DB imported before task/habit colors existed, so his rows
  use auto-rainbow unless hand-pinned (re-import would restore mochi colors
  but overwrites edits made since — ask first).
- His timezone assumption for historical imports: America/Chicago.
