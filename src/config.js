// App-wide constants. The name is undecided (§12) — change it here and in
// index.html / vite.config.js manifest when it lands.
export const APP_NAME = 'Planner';

// Nav is a declarative config (§6). Adding a page = adding an entry here
// plus a route in App.jsx. Each section owns one of the six rainbow accents.
// `icon` is a name in components/Icon.jsx, not an emoji — see the note there.
export const NAV = [
  {
    // Home owns the section path '/', and Stats hangs off it rather than
    // taking a seventh seat in the nav: it's a way of looking at what Home
    // already shows, not another place to keep things.
    id: 'home', label: 'Home', icon: 'home', path: '/', accent: 1,
    children: [
      { id: 'today', label: 'Today', path: '/' },
      { id: 'stats', label: 'Stats', path: '/stats' },
    ],
  },
  {
    id: 'tasks', label: 'Tasks', icon: 'tasks', accent: 2,
    children: [
      { id: 'open', label: 'To Do', path: '/tasks' },
      { id: 'done', label: 'Done', path: '/tasks/done' },
    ],
  },
  {
    id: 'habits', label: 'Habits', icon: 'habits', accent: 3,
    children: [
      { id: 'today', label: 'Today', path: '/habits' },
      { id: 'month', label: 'Month', path: '/habits/month' },
      // Archiving used to be a one-way door: the row vanished and there was
      // no screen anywhere that could show it again.
      { id: 'archived', label: 'Archived', path: '/habits/archived' },
    ],
  },
  {
    id: 'studio', label: 'Studio', icon: 'studio', accent: 4,
    children: [
      { id: 'active', label: 'Active', path: '/studio' },
      { id: 'archived', label: 'Archived', path: '/studio/archived' },
    ],
  },
  {
    // Ledger moved to Settings. The shop is the two screens you actually
    // shop with; the ledger is an audit log, and it was the third tab you
    // never wanted while browsing.
    id: 'shop', label: 'Shop', icon: 'shop', accent: 5,
    children: [
      { id: 'store', label: 'Store', path: '/shop' },
      { id: 'inventory', label: 'Inventory', path: '/shop/inventory' },
    ],
  },
  // The tumbler runs on grit, not points — a separate economy on purpose, so
  // there's a reason to open the app that isn't a task. It takes the sixth
  // accent, which finally gives every hue in the palette a section of its own.
  {
    id: 'tumbler', label: 'Rocks', icon: 'gem', accent: 6,
    children: [
      { id: 'barrels', label: 'Barrels', path: '/tumbler' },
      { id: 'shelf', label: 'Shelf', path: '/tumbler/shelf' },
      { id: 'collection', label: 'Collection', path: '/tumbler/collection' },
    ],
  },
];

// A section's "home path" — its own path or its first child's.
export function sectionPath(section) {
  return section.path ?? section.children?.[0]?.path ?? '/';
}

// Longest-prefix match of a path against the nav tree.
// Returns { section, child } (child may be null).
export function matchNav(pathname) {
  let best = { section: NAV[0], child: null, len: -1 };
  for (const section of NAV) {
    const candidates = section.children
      ? section.children.map((c) => ({ child: c, path: c.path }))
      : [{ child: null, path: section.path }];
    for (const { child, path } of candidates) {
      const matches = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
      if (matches && path.length > best.len) best = { section, child, len: path.length };
    }
    // Section prefix (e.g. /studio/p/abc under studio) even if no child matches exactly.
    const base = sectionPath(section);
    const root = base.split('/').slice(0, 2).join('/') || '/';
    if (root !== '/' && (pathname === root || pathname.startsWith(root + '/')) && best.len < 0) {
      best = { section, child: section.children?.[0] ?? null, len: 0 };
    }
  }
  return { section: best.section, child: best.child };
}
