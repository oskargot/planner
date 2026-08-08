// App-wide constants. The name is undecided (§12) — change it here and in
// index.html / vite.config.js manifest when it lands.
export const APP_NAME = 'Planner';

// Nav is a declarative config (§6). Adding a page = adding an entry here
// plus a route in App.jsx. Each section owns one of the six rainbow accents.
// `icon` is a name in components/Icon.jsx, not an emoji — see the note there.
//
// Every section's `path` is its DASHBOARD (design.md §1): tapping a section
// lands on a screen of cards, one per sub-page, and the pages themselves live
// one level down. The dashboard is deliberately not in `children` — it isn't a
// tab, it's where the section icon takes you, including from inside the
// section (that's the way back up). A child may carry `also`: extra path
// prefixes that belong to it for nav-highlighting purposes (the project detail
// pages are Active's, but live under /studio/p/).
export const NAV = [
  // Home has no sub-pages, and shouldn't: it's the landing screen, and a
  // sub-tab row on it is a row of chrome you see on every single visit. Stats
  // lived here briefly and was obtrusive for exactly that reason — it's over
  // with the ledger now, which is where the other look-don't-touch page is.
  { id: 'home', label: 'Home', icon: 'home', path: '/', accent: 1 },
  {
    id: 'tasks', label: 'Tasks', icon: 'tasks', path: '/tasks', accent: 2,
    children: [
      { id: 'open', label: 'To Do', path: '/tasks/todo' },
      { id: 'done', label: 'Done', path: '/tasks/done' },
    ],
  },
  {
    // Chores live here rather than in a section of their own: a habit and a
    // chore are the same kind of thing at two different rhythms — recurring
    // work you keep returning to — and the only real difference is that one
    // is scored daily and the other waits out a cooldown. Splitting them
    // across two top-level tabs made you ask "which list was that on?", which
    // is the question good organisation is supposed to delete.
    //
    // It also settles the accent arithmetic: Chores was holding the sixth
    // accent, which belonged to Rocks before the two got folded together.
    // Six sections, six accents, one hue each again.
    id: 'habits', label: 'Habits', icon: 'habits', path: '/habits', accent: 3,
    children: [
      { id: 'today', label: 'Today', path: '/habits/today' },
      // Today and Month are one list at two zoom levels, so nothing goes
      // between them.
      { id: 'month', label: 'Month', path: '/habits/month' },
      { id: 'chores', label: 'Chores', path: '/habits/chores' },
      // Archiving used to be a one-way door: the row vanished and there was
      // no screen anywhere that could show it again.
      { id: 'archived', label: 'Archived', path: '/habits/archived' },
    ],
  },
  {
    id: 'studio', label: 'Studio', icon: 'studio', path: '/studio', accent: 4,
    children: [
      { id: 'active', label: 'Active', path: '/studio/active', also: ['/studio/p'] },
      { id: 'archived', label: 'Archived', path: '/studio/archived' },
    ],
  },
  {
    // Shop and Rocks were folded into one section for a release and are split
    // again. Merging them was a nav decision that read as an economic one:
    // six sub-tabs in one section, half of them spending points and half
    // spending grit, which is exactly the confusion the two ledgers exist to
    // prevent. Two sections say it structurally, with no explaining to do.
    //
    // Ledger stays under Settings for the same reason it left these tabs:
    // it's an audit log, not a place you browse.
    id: 'shop', label: 'Shop', icon: 'shop', path: '/shop', accent: 5,
    children: [
      { id: 'store', label: 'Store', path: '/shop/store' },
      { id: 'inventory', label: 'Inventory', path: '/shop/inventory' },
    ],
  },
  // The rock economy, back in its own section and back on the sixth accent.
  // It runs on grit, not points — separate on purpose, so there's a reason to
  // open the app that isn't a task.
  //
  // Paths stay under /tumbler: they're invisible in a standalone PWA, and
  // renaming them would churn every bookmark and screenshot route for nothing.
  {
    id: 'tumbler', label: 'Rocks', icon: 'gem', path: '/tumbler', accent: 6,
    children: [
      { id: 'barrels', label: 'Barrels', path: '/tumbler/barrels' },
      // The active half of the rock economy, next to the idle half.
      { id: 'mine', label: 'Mine', path: '/tumbler/mine' },
      { id: 'shelf', label: 'Shelf', path: '/tumbler/shelf' },
      { id: 'collection', label: 'Collection', path: '/tumbler/collection' },
    ],
  },
];

// A section's home path — its dashboard. Every section carries a real `path`
// now, so the old ?? children[0].path fallback is gone (design.md §1).
export function sectionPath(section) {
  return section.path;
}

// Longest-prefix match of a path against the nav tree.
// Returns { section, child } (child may be null — the section's dashboard).
export function matchNav(pathname) {
  let best = { section: NAV[0], child: null, len: -1 };
  const hit = (path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
  for (const section of NAV) {
    const candidates = [{ child: null, path: section.path }];
    for (const c of section.children ?? []) {
      for (const path of [c.path, ...(c.also ?? [])]) candidates.push({ child: c, path });
    }
    for (const { child, path } of candidates) {
      if (hit(path) && path.length > best.len) best = { section, child, len: path.length };
    }
  }
  return { section: best.section, child: best.child };
}
