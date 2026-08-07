# Design specifications

Agreed design direction for Planner. This is where a principle lives between
being decided and being built — CLAUDE.md is the working summary of what the
app actually *does*, so a spec moves there (compressed) once it ships.

Each section notes its status. Nothing here is a suggestion; it's the shape
the app is heading toward.

---

## 1. Nested dashboards

**Status: specified, not built.**

Every level of the app has a home, and every home is a dashboard.

The app is currently flat: six sections along the bottom bar, and inside each
one a row of sub-tabs you slide between. Everything is one tap from everything,
and nothing is *inside* anything — there is no "in" and no "back", only
sideways. The tree it draws is two levels deep and entirely made of chrome.

Instead: **Home is a dashboard of five cards, one per section. Tapping a card
takes you to that section's own dashboard, whose cards are its sub-pages.
Tapping one of those takes you to the page.** Three depths, dashboards at the
first two, real content at the third.

### The one-level-down rule

The rule that keeps the middle screen from being dead weight: **a dashboard
summarises one level down, never two.**

Home's Habits card is a digest of the *section* — the day's ratio, a streak
worth protecting, a chore that's come ready. It is not a copy of today's habit
list. The Habits dashboard is where you get one card per sub-page, each showing
that page's real content.

Without this rule the same list appears at three depths, each version smaller
than the last, and the middle one becomes a screen you tap through without
reading. Home answers *how am I doing*; a section dashboard answers *what's in
here and what needs me*; the page is the thing itself.

The clearest consequence: **Home drops to five cards.** It has six today, and
two of them are sub-page-level — Chores and Inventory. Those fold into the
Habits and Shop digests respectively. If Home has a card for something one
level below a section, the rule is being broken.

### Every card carries information

A card is never just a labelled door. If a card can't say something true about
what's behind it, the design is wrong — not the card.

This binds hardest on the thin sub-pages, which get cards like everything else:

- **Archived** (habits, studio) — how many, and the most recent one.
- **Done** (tasks) — what got finished today, or how long since anything did.
- **Collection** — squares filled out of 45, and the last one discovered.
- **Month** — the heat grid itself, which is already a picture.

A section dashboard is allowed to be uneven — one tall live card and three
quiet ones is fine, and probably right for Habits — but "quiet" means small,
not empty.

### Interaction stays minimal

Cards are mostly for reading. The point of a page is that you go to it, and a
card that does everything the page does is a reason never to arrive.

Keep what Home has today (ticking a habit, completing a task) and add
sparingly. When in doubt, the card shows and the page acts.

### The tabs stay

Sub-tab rows are not replaced. The drill-down is the scenic route, not the only
one — nothing gets further away from a keyboard, from ⌘K, or from someone who
already knows where they're going.

- Tapping a **section** (bottom bar or rail icon) goes to its dashboard.
- Tapping the section you're **already in** returns you to its dashboard. That's
  the way back up, and the reason the dashboard doesn't need a tab of its own.
- The **sub-tab row** moves laterally between pages, exactly as now. The
  dashboard is not one of the tabs; a tab called "Overview" would be a row of
  chrome standing in for a tap you already have.

### Wide screens get more dashboard, not less

The rail's flyout already lists a section's sub-pages by name, which is why
this looked at first like a screen an iPad would blow past. It isn't: the
flyout gives you four words, and the dashboard gives you the chore that's
ready. Words don't substitute for that at any width.

So dashboards exist at every width and the iPad gets the better version of
them. **More cards and bigger ones, per section, rather than one generic grid
that reflows.** Home already earns its two-column layout by hand — habits →
studio → inventory on the left, tasks → rocks on the right, placed by explicit
`grid-column` so the DOM keeps the phone's reading order. Section dashboards
should be laid out with the same care and the same technique: Habits and Rocks
have four real sub-pages and room for a composed layout; Tasks and Studio have
two and want something simpler.

The phone layout is the source of reading order in every case. Nothing may
exist only in the wide layout.

### Settings stays a side door

Settings, Stats and the Ledger remain off the tree, behind the gear. Settings
are settings — they aren't a place you explore, and giving them a dashboard
would be a dashboard about the app rather than about your life.

### Routing

A section's root path becomes its dashboard, and the page that used to live
there moves down one:

| now | becomes |
| --- | --- |
| `/tasks` (To Do, two-pane) | `/tasks` = dashboard, `/tasks/todo` = To Do |
| `/habits` (Today) | `/habits` = dashboard, `/habits/today` = Today |
| `/studio` (Active, two-pane) | `/studio` = dashboard, `/studio/active` = Active |
| `/shop` (Store) | `/shop` = dashboard, `/shop/store` = Store |
| `/tumbler` (Barrels) | `/tumbler` = dashboard, `/tumbler/barrels` = Barrels |

Everything else keeps its address. Old bookmarks to `/tasks` still resolve —
they land on the dashboard instead of the list, which is a graceful degradation
rather than a break, so these need no redirects.

`sectionPath()` gets simpler: every section has a real `path` of its own, and
the `?? children[0].path` fallback goes away.

Things that must move with the routes, none of them optional:

- `NAV` in `config.js` — each section gains a `path`; the promoted child gains
  the new one.
- The `n` shortcut in `App.jsx` navigates to `/tasks/todo` — its whole job is
  putting the cursor in the add box, and the dashboard has no add box.
- Keys `1`–`6` walk to section dashboards, which `sectionPath()` gives for free.
- `⌘K` palette entries point at pages, not dashboards, for anything that names
  a specific list.
- `scripts/shots.mjs` — every moved route, plus five new dashboard screens at
  both viewports.
- `/studio/p/:id` still renders `Studio.jsx`; the two-pane behaviour is unchanged
  and simply lives at `/studio/active` now.

### What this does not change

- The two-pane screens stay two-pane. `/tasks/todo` and `/studio/active` are the
  same components doing the same thing at ≥900px — you arrive one tap later.
- No section gains or loses a sub-page, and the six accents are untouched.
- Home keeps its greeting, its balance and its gear.

### Open

- Whether the section dashboard animates as a descent (the page slide is
  currently horizontal and section-indexed) or just appears.
- Whether Home's five cards should be visibly the same *kind* of object as a
  section dashboard's cards, or read as a tier above them.
