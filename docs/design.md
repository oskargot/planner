# Design specifications

Agreed design direction for Planner. This is where a principle lives between
being decided and being built — CLAUDE.md is the working summary of what the
app actually *does*, so a spec moves there (compressed) once it ships.

Each section notes its status. Nothing here is a suggestion; it's the shape
the app is heading toward.

---

## 1. Nested dashboards

**Status: shipped.** Compressed into CLAUDE.md ("Every section root is a
dashboard"); the full spec is in this file's git history. The section number
stays so §2's references to it keep resolving.

Open questions that survived the build:

- Whether the section dashboard animates as a descent (the page slide is
  still horizontal and section-indexed) or just appears — it just appears.
- Whether Home's five cards should be visibly the same *kind* of object as a
  section dashboard's cards, or read as a tier above them — currently the
  same kind.

---

## 2. The frame is constant, the contents are not

**Status: the frame itself is shipped** — the three tiers, the contextual
currency slot, and the persistent phone top row are compressed into CLAUDE.md
("The constant frame"); the full spec for those parts is in this file's git
history. **Still open here**: dashboard forms, the sub-tab questions, and
dismissible chrome, below. Studied from Chiikawa Pocket (ちいかわぽけっと)
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

### Shipped: the three tiers, the contextual currency, the phone frame

Compressed into CLAUDE.md. In one breath: chrome comes in three tiers
(identical everywhere / positionally fixed but contextually filled / wholly the
section's); the currency slot is the whole of tier 2 — a page shows the
currency it spends and never both, so there is no screen where the two numbers
can be compared; and the phone got a persistent top row (grown from Home's old
header) that carries the currency, search and the settings door on every
screen. The rail's balance slot follows the same rule at ≥900px.

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

- ~~Whether the persistent top row on a phone carries anything besides the
  currency and the gear.~~ Settled in the build: the wordmark on Home, nothing
  elsewhere — pages keep their own titles, and the row gained search (which
  the phone previously had no way to open at all).
- Whether removing sub-tab rows from two-page sections (Tasks, Studio) is a
  simplification or a regression. Worth building one of each and looking.
- Whether the sub-tab row moves to the bottom on phones generally, which is a
  bigger change than it sounds and touches every section.
