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

`docs/design.md` holds agreed design direction that isn't built yet — read it
before changing navigation or page structure. A spec moves out of that file and
into this one, compressed, once it ships; **nested dashboards** (§1) shipped
and lives in the bullets below. Currently specified and unbuilt: **the
constant frame** (§2), which makes the phone's top row persistent and its
currency readout contextual — points on five sections, grit on Rocks, never
both at once — and wants dashboards to eventually take section-shaped forms
(Rocks as a workshop map) rather than card grids.

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
`claude/planner-gacha-machine-task-61aau8` (the task gacha from mochi house,
rebuilt); before it were
`claude/planner-mining-organization-qnzqlh` (the nav reshuffle — chores under
habits, Rocks split back out of Shop — plus the workshop split and the
extraction-cost fix),
`claude/planner-open-count-bug-n5js09` (the stuck-barrel duplicate fix, then
chores + the shop/rocks nav fold),
`claude/planner-app-revamp-planning-ll1wyu` (the iPad revamp: dark theme,
two-pane screens, ⌘K, stats, undo toasts, gem fusion),
`claude/planner-sub-tabs-redesign-2tp87l` (the sub-tab flyout),
`claude/planner-redesign-features-tmhiy4` (colour palette + long-press +
tumbler), `claude/iphone-planner-redesign-p6fw8r` (the iPhone pass) and
`claude/oskar-planner-v1-wqpzus` (v1). Both pushes every time:

```bash
git push -u origin claude/planner-gacha-machine-task-61aau8
git push origin claude/planner-gacha-machine-task-61aau8:main
```

## Architecture map

```
src/
  config.js          APP_NAME + declarative NAV (add a page = entry + route)
  greeting.js        pure: time-of-day hello + the ranked flavor lines
  theme.js           pref (paper|dark|mono|auto) → resolved data-theme, and
                     the prefers-color-scheme listener behind 'auto'
  toast.js           the toast store; every undo handed to it is append-only
  useLongPress.js    hold-to-edit gesture (iOS callout/selection suppression)
  useMediaQuery.js   useWide() — the ONE breakpoint the DOM branches on
  db/
    time.js          logicalDay() and ALL date math — never elsewhere
    db.js            Dexie schema, insertRow/updateRow/softDelete, meta
    actions.js       every POINTS mutation (tasks, subtasks, habits,
                     projects, shop); only place `ledger` is written
    tumbler.js       every GRIT mutation; only place `tumbler_ledger` is
                     written. Never touches points, and vice versa.
    selectors.js     balance, earned-today, heat ratios, staleness,
                     habitStreaks, useGreetingState + useStats (one snapshot
                     each, so the numbers on a screen always agree)
    sync.js          push/pull loop (LWW on updated_at), debounced 2s
    backup.js        client-side JSON export/import (merge, LWW)
  themes/            _tokens.css is the contract; paper + dark + mono
  components/        NavBar (bottom bar <900px; ≥900px an icon rail whose
                     sub-page tabs fly out from behind it, balance on top
                     and search/gear at the foot), Card, Check,
                     ColorPicker (itemAccent helper lives here),
                     Icon (the whole inline-SVG glyph set),
                     Palette (⌘K), Toasts (the undo rail),
                     MiniMonth (the heat calendar Home and the Habits
                     dashboard share),
                     Gacha (the task gacha machine on the Tasks dashboard;
                     the economics live in actions.js, this is only the
                     reveal)
    mine.js          the mine's stored half: chunk bitmasks, dig/extract,
                     prestige reset. Spends grit through tumbler.js's addGrit
                     rather than writing tumbler_ledger itself.
  tumbler/
    gems.js          pure generation: species, grades, cycles, odds, fusion,
                     geometry
    Gem.jsx          the SVG renderer (dumb; all maths lives in gems.js)
  mine/
    board.js         pure: an infinite minesweeper board as a hash of
                     (seed, x, y). No grid is ever generated or stored.
  pages/             one file per screen — EXCEPT Studio.jsx, which is both
                     /studio/active and /studio/p/:id (see the two-pane note
                     below). The five *Dash.jsx files are the section
                     dashboards (design.md §1)
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
- **Every undo is a new action, never an edit of history.** The toasts made
  this load-bearing: restoring a deleted task re-awards its points as a third
  row, a refunded purchase is a positive `purchase` row, an un-crushed gem is a
  negative `crush` row. Rubbing out the original would make a device that
  already synced it disagree about the balance forever.
- **Points and grit never mix, with exactly one exception.** No task earns
  grit, no gem buys a shop item, grit buys nothing but rocks, and neither
  balance is ever read by the other side. `tumbler_ledger` follows the same
  append-only rule — the grit balance AND the upgrade levels are both derived
  from its rows, because a plain counter synced LWW loses spend when two
  devices are offline.
  - The exception, added on request: **filling a new square in the collection
    pays points, once, forever** (`awardDiscovery` in actions.js, reason
    `discovery`). It runs in one direction only and it is a bounty on
    DISCOVERIES, not on stones — 45 squares, each paying exactly once. That's
    what keeps it safe: it can't be farmed, and it can't make you late, which
    is the property the wall was really protecting. A per-stone rate would
    make *not* tumbling cost you points, and that's the version that turns the
    game into a chore.
  - `mintGem` in db/tumbler.js is the only place a gem row is created —
    barrels, fusion and the mine all go through it — which is what makes the
    bounty impossible to forget at one of three call sites.
- **The gacha rolls a task's worth ONCE, at creation, and stores it**
  (`gacha_points` on the row) — the same rule that fixes a barrel's stone at
  load time: sync shows every device the same worth, and nothing re-rolls on
  completion. The worth is locked (the editor shows a chip where the size
  picker would be) because an editable roll is theater. Rolling pays nothing;
  the points land through `completeTask` like any other task, so the crank
  can't be farmed. `GACHA_POOL` is 1/2/3/5/8/13 — mean ~5.3, a whisker over a
  Medium, so the machine is a gamble, not a raise. A gacha task still gets a
  `size` (the nearest bucket) so filters and grouping keep working. Reroll by
  delete-and-retype is possible and deliberately unguarded — same honesty
  wall as marking every task Large.
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
  in `paper.css`/`dark.css`/`mono.css`. The mono theme exists to prove the
  contract. `data-theme` only ever holds a REAL theme; `auto` is resolved in
  `theme.js` and never reaches CSS, so every selector stays a plain
  `[data-theme='dark']`.
- **`--accent-N` is a pale pastel and is NOT readable as text.** Anything that
  paints an accent AS a glyph or letters uses `--accent-N-ink`; anything that
  puts ink ON an accent fill (the checkbox tick) uses `--on-accent`. Painting
  a rainbow into text takes `--gradient-rainbow-ink`, not the pastel sweep.
  `-ink` means "readable as text", NOT "darker": on Paper it's a deep version
  of the accent, on Dark it's a pale one. That inversion is the only reason
  the same rules work in both themes.
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
- **No task↔project links, no login, no due dates** — deliberate non-goals;
  don't add hooks for them. "No recurring tasks" was on this list until Oskar
  asked for chores; the shape that made them admissible is the cooldown (next
  bullet), NOT a schedule — recurring tasks with due dates are still out.
- **Chores are a cooldown, never a schedule.** Doing one starts a rest of
  `interval_days`; after that it's simply *ready* and waits forever — ready is
  the terminal state, there is no "overdue" and no date anywhere. Completing
  pays by size like a task (ledger reason `chore`, undo = negative row of what
  the day actually paid). A resting chore's checkbox is disabled: the cooldown
  is the anti-farm wall, the same job the zero-point rule does for subtasks —
  without it a 7-day chore checked daily is task points for free. Entries
  mirror `habit_entries` (day-scoped, UNIQUE(chore_id, day), revive-don't-remint,
  server merges via the same dayConflict path).
- **On a task row, tap opens its subtask drawer and hold opens the editor.**
  A completed long press also fires a click on release, so the tap handler
  checks `consumedRef` from `useLongPress` or the drawer opens behind the
  editor. One drawer open at a time — the open id lives on the list, not the
  row, because opening one closes another.
- **Editing is a long press, never a visible control.** Shop boxes, task rows,
  habit rows and shelf gems all use `useLongPress`; a primary action inside a
  long-press target (checkbox, price tag) must `stopPropagation` on
  `pointerdown` or a hold will fire both. Each such screen carries one quiet
  `.longpress-hint` line, which is the whole discoverability budget — and that
  line says "hold" or "right-click" depending on `(hover: hover) and
  (pointer: fine)`, because nobody's instinct on a trackpad is to press and
  wait. `useLongPress` has always mapped `contextmenu` to the same handler.
- **Two-pane screens are one component, not two.** Tasks and Studio render a
  list on a phone and list-plus-detail at ≥900px, branching on `useWide()`.
  Studio serves `/studio` and `/studio/p/:id` from the same file specifically
  so a list module and a detail module can't end up importing each other. The
  phone paths are untouched by this: drawer, long-press editor, full-page
  project. Nothing may exist only in the wide layout.
- **No confirm() anywhere.** A native dialog in a standalone PWA reads as the
  browser breaking through the app, and it asks before you can see what
  happened. Destructive actions do the thing and offer a toast with an undo.
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
  cost you a square. That's what makes crushing a duplicate a free decision,
  and it's what makes fusing one free too.
- **Fusion: three stones of one grade → one of the next grade up.** The result's
  species is drawn from the three you fed it, so three of a kind is how you
  aim at a specific square instead of waiting for the barrel to hand it to
  you. The inputs are tombstoned (see above — the squares survive), the price
  is the stones and nothing else, and `fuseGems` never touches
  `tumbler_ledger`. Flawless is the ceiling; there's nothing above it.
- **The mine is the active half, and the gems are the mines.** Tap to dig —
  free, and open ground counts the gems around it. Hold or right-click to
  extract for grit, which is the only way a stone comes out whole. Swing at a
  gem and it shatters: you get a third of its crush value in shards and **no
  `gems` row is created**, so it fills no collection square. That's the entire
  cost of carelessness, and it's why the minigame needs no fail state — you
  can only ever lose something you never had.
  - Extraction costing grit is what stops "hold every cell" from being the
    whole game. It's also what ties the two halves together: the barrels make
    gems slowly, crushing makes grit, and grit buys extractions — so reading
    the board is the exchange rate between them.
  - The board is a pure function of `(mine_seed, x, y)`: nothing is generated,
    allocated or stored, both devices compute the same ground, and the stone
    you can see in a cell is the one you get. Only the dug ground is stored,
    as bitmasks over 16×16 chunks with **derived row ids**, so two devices
    digging offline merge by LWW instead of needing a unique index. Losing a
    few dug cells to a split is fine — digging is free.
  - The flood fill's cap is not optional: on a board with no edges, an
    uncapped fill is a frozen tab rather than a slow one.
  - Prestige (`UPGRADES.prestige`) rerolls the world and raises density
    permanently. Density cuts both ways on purpose — richer ground is also
    harder to deduce. The collection, the shelf and the grit all survive it;
    it resets the ground, not your work.
- Balance knobs all live in `tumbler/gems.js` (`CYCLES`, `rollGrade`,
  `rollSpecies`, `GRADES[].grit`), `db/tumbler.js` (`UPGRADES`),
  `mine/board.js` (`BASE_DENSITY`, `DENSITY_PER_PRESTIGE`) and `db/mine.js`
  (`EXTRACT_COST`).
- Gem identity (species/grade/name) is STORED on the row; only the drawing is
  derived from the seed. Retuning the facet maths redraws old gems but can
  never re-grade them.
- `color-mix()` with a percentage outside 0–100 is invalid, and an invalid fill
  on an SVG polygon renders BLACK. That showed up as one random black facet on
  high-grade stones — every ratio goes through `mix()` in `gems.js` now.

## Known state / open threads

- Named "Planner" as of the sub-tabs branch (wordmark, title, PWA manifest).
  Still a plain descriptive name rather than the one from §12 if he ever
  picks one.
- The tumbler was retuned once after Oskar lived with it: cycles 2/6/14h →
  1/4/10h, speed 8% → 10% a level, all three upgrade tracks ~25% cheaper. That
  was in response to "it's a little slow", not to measurement — expect another
  pass. Fusion is brand new and completely untuned by play.
- Theme defaults to `auto` for anyone whose `theme` meta is unset, which
  includes Oskar unless he's pressed a theme button. Auto follows the system,
  which on iOS follows its own sunset schedule. `index.html` has an inline
  script that reads the mirrored `localStorage` preference before React boots;
  without it a dark launch flashes white for as long as IndexedDB takes to
  open, which is the exact thing auto exists to prevent.
- Stats deliberately shows no grit and no combined score. Discoveries appear
  there as a points source like any other, but there is still no single number
  spanning both economies and there shouldn't be.
- Stats and the Ledger both live under Settings and neither is in the nav.
  Stats spent one release as a sub-page of Home and was obtrusive: giving Home
  children puts a sub-tab row on the landing screen, which you then see on
  every single visit. Home has no sub-pages for that reason.
- Chores are brand new and untuned: default interval 7d, default size S, and
  the "Nd since" quiet fact only appears past 2× the interval. The disabled
  resting checkbox is the piece most likely to get pushback — if Oskar wants
  to do a chore early, the honest version is an unpaid early check, not
  paying early.
- `EXTRACT_COST` is **3**, down from 6 because the mine read as too harsh.
  The old number was tuned against a note claiming a "~11-grit average crush",
  but 11 is one CLEAR stone, not the average of the grade table: at prestige 0
  the real expectation is 55/25/13/5.5/1.5 over grit 2/5/11/24/55 = 5.9, or
  6.1 with the mine's 3% rare chance. So a perfectly read extraction returned
  about +0.1 grit and a misread one was a flat −6 — careful play paid nothing
  and the mine drained the barrels rather than rewarding them. At 3 a correct
  read clears ~+3 before you decide whether to keep the stone, while blind
  extraction still runs about −2.3 a cell, so the wall against "hold every
  square" holds. **Do not make an empty extraction free or refunded** — that
  takes the blind line to about −0.5 and the numbers on the board stop being
  worth reading, which is the whole game. Any future retune should redo this
  arithmetic rather than trusting a remembered number; that's how it went
  wrong the first time.
- Still untuned by play: the shard/extract ratio (whether careless digging is
  ever worth it), and the fact that at prestige 0 the mine mostly yields
  Chipped/Clouded — the grades you already have — so extraction fills new
  collection squares more slowly than it looks like it should.
- Task rows no longer show a size chip anywhere (list or Home) — the size is
  in the editor and the detail pane only. It's something you set once.
- The gacha is brand new and untuned: pool 1/2/3/5/8/13, uniform draw. Rows
  deliberately don't show a gacha task's worth (same set-once rule as size);
  it's in the editor, the detail pane, and the Done list's +N chip. The
  machine lives on the Tasks dashboard — "present on its home page" was the
  original request, and the dashboard is now the section's home. It spent one
  commit under the To Do page's add box first.
- The Tasks toolbar takes two rows on a 390px phone. Acceptable for now; if it
  annoys, the group chips are the half to hide behind a toggle.
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
- The awning measures itself and divides its width into a whole number of
  bands (`--awning-band`, set inline by `<Awning>`); the stripe gradient and
  the scallop mask are both derived from it. The band was a hardcoded 28px,
  and since no screen is a multiple of 28 the canvas always ended mid-stripe
  and the valance mid-scallop — very visible on a phone, where a sliced
  scallop is a sixth of the awning. Don't reintroduce a fixed period.
- `-webkit-line-clamp` needs a non-positioned element: absolute positioning
  blockifies `display: -webkit-box` and silently drops the clamp. That's why
  `.box-name` clamps an inner `<span>`.
- Oskar picked the rainbow ripple for the tap effect; the sparkle-stars and
  bubble variants were the runners-up if he wants to swap.
- **Every section root is a dashboard** (design.md §1, shipped). Home is five
  cards, one per section — Chores folded into the Habits digest and Inventory
  into Shop's, because a Home card for a sub-page breaks the rule below. A
  section root is one card per sub-page, and the pages moved down a level:
  `/tasks/todo`, `/habits/today`, `/studio/active`, `/shop/store`,
  `/tumbler/barrels`. No redirects — old root bookmarks land on the dashboard,
  which is graceful, not broken.
  - **The one-level-down rule: a dashboard summarises one level down, never
    two.** Every card says something true about its page (a count, a name, the
    heat grid, "last finished 3d ago") and is the door to it; a card that's
    just a labelled door means the design is wrong, not the card.
  - **Interaction stays minimal**: habit ticks, task completes, chore checks
    and project touches — what Home already allowed — plus the gacha, which
    Oskar asked for on the Tasks home. Everything else shows on the card and
    acts on the page. Barrels are read-only here on purpose: opening one has
    a reveal, and the reveal lives on its page.
  - Tapping a section icon — including the section you're already in — goes to
    its dashboard; that's the way back up, so the dashboard needs no tab of its
    own and isn't one ("Overview" would be chrome standing in for a tap you
    already have). The sub-tab rows are unchanged.
  - `sectionPath()` is just `section.path` now. A nav child can carry `also`
    (extra path prefixes for highlighting — `/studio/p` belongs to Active).
    The `n` shortcut goes to `/tasks/todo`, where the add box is.
  - Wide screens: a dashboard is two explicit `.dash-col` columns, left column
    first in the DOM (that's the phone reading order). Columns as grid items
    rather than per-card `grid-column` (Home's technique) because a tall live
    card sharing grid rows with short neighbours opens gaps under them.
- Nav is six sections, and the accent arithmetic finally works out: Home 1,
  Tasks 2, Habits 3, Studio 4, Shop 5, Rocks 6, one hue each. Two moves got it
  there, both on request:
  - **Chores are a sub-page of Habits** (Today / Month / Chores / Archived),
    not a section. They're the same kind of thing at two rhythms — recurring
    work — and two top-level tabs made you ask which list something was on.
    Nothing about the *mechanic* merged: chores are still a cooldown, still
    pay ledger reason `chore`, still have their own table.
  - **Shop and Rocks are separate sections again.** Folding them together put
    six sub-tabs in one section, half spending points and half spending grit,
    which is the confusion two ledgers exist to prevent. Rocks took accent 6
    back from Chores, so the tumbler pages' accent-6 dots agree with their
    section again. Routes stay under `/tumbler` — invisible in a PWA, and
    renaming them would churn bookmarks and every `shots.mjs` route for
    nothing. `/chores` redirects to `/habits/chores`.
  - Neither section's sub-tab row needs the horizontal scroll the six-tab Shop
    did; four labels fit 390px.
- Stats colours bars by SOURCE, not by nav section, so chores are accent 1
  there: habits already hold 3 and discoveries hold 6, and two bars in one
  chart can't be the same colour. (Chore and discovery both sat on 6 before —
  that was a real collision, not a choice.)
- The upgrade list is one shared `Workshop` component taking a `keys` array.
  Barrels/speed/quality render at the foot of the Barrels page; **prestige
  renders under the Mine's board**, because it buys nothing you can see on the
  barrels screen and rerolls ground you weren't looking at. `keys` rather than
  a filter flag so a new track has to choose where it appears. The gap above
  it is `.workshop`'s own `margin-top` now — it used to be `.barrels`'
  `margin-bottom`, which only worked while the list had exactly one home.
- Left rail appears at ≥900px. Confirmed: iPad portrait (834pt) keeps the
  bottom bar and that's what he wants — he doesn't use portrait. Don't lower
  the breakpoint to "fix" it.
- The rail is an icon column plus the balance on top and search/gear at the
  foot. The icons live in their own `.rail-sections` flex child that takes the
  whole middle and centres inside it, so adding things to either end can't
  push them off centre. The sub-page tabs are a
  flyout that slides out from behind it, absolutely positioned beside the
  section they belong to and centred on it — no lane is reserved, so a section
  without sub-pages costs no width. Out of flow on purpose: the section icons
  must never move. Note `.nav-rail` carries no `overflow` property, because a
  non-visible overflow on either axis forces the other to clip and would slice
  the flyout off.
  - "Behind" is real painting order, not a shadow trick: `.rail-wrap` is the
    stacking context (`isolation: isolate`), `.rail-subs` sits at `z-index: -1`,
    and `.nav-rail`'s opaque background — a non-positioned in-flow box, painted
    after negative-z-index descendants — is what hides it. `.rail-group` must
    stay `z-index: auto` or it becomes the stacking context and the flyout hides
    behind the wrong thing. The panel wants to stay narrower than the rail's
    96px so it's fully tucked away at rest.
  - Labels went back to horizontal: `writing-mode: vertical-rl` only existed to
    fit the old 52px gutter, and a panel floating over the page can be as wide
    as its longest word.
  - It floats over the page rather than pushing it, so `.page` reserves 120px
    of left padding at ≥900px and `.rail-subs` is capped at 116px to match.
    This was `--space-7`, which only worked because `.page-inner` was capped at
    900px and centred — the leftover margin absorbed the panel. Now that pages
    use the full width (`max-width: 1180px` at ≥900px) that margin is gone, and
    at `--space-7` the flyout sat on top of the first row of the task list.
    Change one of those three numbers and you have to change the others.
- The page bloom needs its fade-to-page-color layer in `base.css`. It's a
  165deg gradient in a wide short tile, so its stops don't line up with the
  tile's bottom edge and it left a faint horizontal seam across every page.
- Oskar's live DB imported before task/habit colors existed, so his rows
  use auto-rainbow unless hand-pinned (re-import would restore mochi colors
  but overwrites edits made since — ask first).
- His timezone assumption for historical imports: America/Chicago.
