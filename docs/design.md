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

---

## 2. The frame is constant, the contents are not

**Status: specified, not built.** Studied from Chiikawa Pocket (ちいかわぽけっと)
at Oskar's suggestion — see the note at the end for what was taken and what
deliberately wasn't.

Every screen puts the same things in the same places. **Consistency of position
is what buys freedom of layout**: because money is always where money is and
the way out is always where the way out is, a screen you have never seen before
is still navigable, and every screen is free to look like nothing else in the
app.

This is the counterweight to §1. Dashboards at every section root risk making
all six sections read as one screen with different nouns on it. They shouldn't
— a section should look like the thing it is. What makes that safe rather than
chaotic is a frame that never moves.

### Three tiers of chrome

The distinction that makes this work is that "chrome" is not one thing:

1. **Identical everywhere.** The nav, the settings door, search. Same content,
   same position, every screen. You stop seeing it, which is the goal.
2. **Positionally fixed, contextually filled.** Same slot, same shape, contents
   depend on where you are. The currency readout is the whole of this tier.
3. **Wholly the section's.** The middle of the screen. Owes nothing to any
   other page.

Most of the value is in tier 2, which is the tier Planner currently doesn't
have at all.

### Currency is contextual

**A page shows the currency it spends, and never both.**

Points appear on Home, Tasks, Habits, Studio and Shop. Grit appears on Rocks.
They occupy the same slot and never share it. The rule the whole app is built
on — points and grit never mix — stops being a thing the code politely respects
and becomes a thing the chrome makes structurally true. There is no screen
where you can compare them, because there is no frame that holds both.

This also answers a question raised while specifying §1 and left open: what
goes in the *other* top corner on a phone. Nothing does. The question assumed
two balances need two homes; they need one home and a rule about who's in it.

### The frame follows you

On a phone today, the balance and the gear exist in Home's header and nowhere
else — leave Home and they're gone. At ≥900px the rail carries them everywhere,
so the iPad already has this property and the phone doesn't. The phone gets it:
the top row persists across every page, with the section's currency in it.

### Dashboards need not be grids

§1 says every section root is a dashboard whose cards carry real information
and act as doors. It does **not** say those cards are rectangles in a grid.

The strongest example in the studied app is its Plaza: three sub-activities
drawn as buildings along a path, each with a name banner, a live resource
count, and an explicit door. Same contract as our card rule — shows something
true, and is the way in — but the form is a map.

Rocks wants this most: barrels, mine, shelf and collection are already
*places*, and a workshop map is a truer picture of them than four boxes.
Habits wants to be a calendar wall. The rule is that a section dashboard's
form should come from what the section *is*, and only fall back to a card grid
when nothing better presents itself.

### Sub-tab rows must earn their place

Planner puts a tab row at the top of every section, uniformly, whether or not
the section needs one. In the studied app exactly one of six sections has a
sub-tab row, and it sits at the *bottom*, directly above the nav — under the
thumb, where a phone control belongs.

Both halves are worth taking. A section with two sub-pages and a dashboard
that already links to both does not obviously need a permanent row of chrome
to say so a second time.

### Chrome is dismissible

Every screen in the studied app can roll its edge shortcuts away into a corner
button, and the scene screens go further with an explicit "Hide Icons" that
clears everything but the picture. It's a global affordance, not a property of
particular screens.

Planner has far less chrome to hide, so this is not urgent — but it's the right
instinct, and it's the reason a dense frame is tolerable in the first place:
**density is acceptable when it's dismissible.** If a Planner screen ever grows
enough furniture to want this, the answer is a way to clear it, not a decision
to show less by default.

### What was studied and not taken

- **Badges on everything.** Nearly every element in that app carries an unread
  dot, including the section you're standing on. That's an engagement machine,
  and it's the exact failure mode this app is built against — nothing expires,
  nothing decays, nothing should make you feel late. A planner covered in dots
  is a planner that makes you feel behind for having had a life.
- **The density itself.** Eleven entry points on one screen is affordable for
  something you sit with for an hour. Planner gets opened for forty seconds to
  tick two habits.
- **The mascot as active state.** Their selected section becomes a larger,
  different drawing that breaks the nav bar's top edge. It's the best thing in
  their nav and it needs a character to work.

### Open

- Whether the persistent top row on a phone carries anything besides the
  currency and the gear — a section title, for instance, which the studied app
  mostly doesn't bother with.
- Whether removing sub-tab rows from two-page sections (Tasks, Studio) is a
  simplification or a regression. Worth building one of each and looking.
- Whether the sub-tab row moves to the bottom on phones generally, which is a
  bigger change than it sounds and touches every section.
