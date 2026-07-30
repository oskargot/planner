/*
 * Theme resolution. There are two different things here and keeping them
 * apart is the whole trick:
 *
 *   pref  — what's stored in meta: 'paper' | 'dark' | 'mono' | 'auto'
 *   theme — what the document actually wears: 'paper' | 'dark' | 'mono'
 *
 * 'auto' resolves against the system's dark-mode setting, which on iOS follows
 * its own sunset schedule. That's the point: the app goes dark on its own
 * rather than waiting to be told, so opening it at 2am doesn't flashbang you.
 *
 * Only the resolved value is ever written to data-theme, so every CSS
 * selector in the app stays a plain [data-theme='dark'] — nothing downstream
 * has to know 'auto' exists.
 */

export const THEMES = [
  { id: 'auto', label: 'Auto', blurb: 'Follows the system — dark at night' },
  { id: 'paper', label: 'Paper', blurb: 'The light one' },
  { id: 'dark', label: 'Dark', blurb: 'Always dark' },
  { id: 'mono', label: 'Mono', blurb: 'Flat ink, no decoration' },
];

const REAL_THEMES = ['paper', 'dark', 'mono'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(pref) {
  if (pref === 'auto') {
    return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches
      ? 'dark'
      : 'paper';
  }
  return REAL_THEMES.includes(pref) ? pref : 'paper';
}

/*
 * The iOS status bar and the browser chrome read <meta name="theme-color">,
 * so a theme that doesn't update it leaves a strip of the old theme across the
 * top of a standalone PWA. The value is read back off the page rather than
 * hardcoded per theme, which keeps _tokens.css the only place a color lives.
 */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim();
  if (bg) meta.setAttribute('content', bg);
}

export function applyTheme(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePref = pref;
  syncThemeColor();
  // Mirrored into localStorage purely so index.html can pick the theme
  // synchronously, before React or IndexedDB exist. Meta is still the source
  // of truth; this is a cache that only ever affects the first paint. Without
  // it, a dark-mode boot flashes the light theme for as long as the DB takes
  // to open — which on a cold iOS start is exactly the flashbang the auto
  // setting exists to prevent.
  try {
    localStorage.setItem('theme-pref', pref);
  } catch {
    /* private mode / storage disabled — the boot flash is the only cost */
  }
  return theme;
}

/*
 * Re-resolve when the system flips. Only matters while the pref is 'auto', but
 * the listener stays installed for the life of the app — it reads the pref off
 * the document each time rather than closing over it, so changing the setting
 * doesn't need to re-register anything.
 */
export function watchSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia(DARK_QUERY);
  const update = () => {
    if (document.documentElement.dataset.themePref === 'auto') applyTheme('auto');
  };
  if (mq.addEventListener) mq.addEventListener('change', update);
  else mq.addListener(update); // older iOS Safari
}
