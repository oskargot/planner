/*
 * The icon set. Hand-rolled inline SVG, stroked in currentColor, so every
 * glyph shares one stroke weight and optical size and inherits whatever color
 * its context sets (nav accents, muted button text, awning white).
 *
 * Why not Unicode text symbols? Two reasons, learned the hard way:
 *  - iOS system fonts have no glyph for half of what we need (⌂ etc.), so you
 *    get tofu or a surprise substitution.
 *  - The ones that do exist come from different fallback fonts, so a row of
 *    them looks like a row of mismatched icon sets even when they all render.
 * U+FE0E and font-variant-emoji:text fix emoji-vs-text presentation, but not
 * missing glyphs or mismatched metrics. SVG fixes all three.
 *
 * Filled icons (spark) set fill on the path themselves; everything else is
 * stroke-only. All paths live on a 24×24 grid.
 */

const ICONS = {
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.8V19a1.2 1.2 0 0 0 1.2 1.2h9.6A1.2 1.2 0 0 0 18 19V9.8" />
      <path d="M10 20.2v-5.4h4v5.4" />
    </>
  ),
  tasks: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8 12.4l2.9 2.9L16.4 9.3" />
    </>
  ),
  habits: (
    <>
      <path d="M16.8 2.6 20.4 6.2l-3.6 3.6" />
      <path d="M20.4 6.2H8.1a4.5 4.5 0 0 0-4.5 4.5v.9" />
      <path d="M7.2 21.4 3.6 17.8l3.6-3.6" />
      <path d="M3.6 17.8h12.3a4.5 4.5 0 0 0 4.5-4.5v-.9" />
    </>
  ),
  studio: (
    <>
      <path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.53 9 7.9 0 2.2-1.79 3.5-3.6 3.5h-1.9a2.2 2.2 0 0 0-2.2 2.2c0 .55.2.97.45 1.4.3.5.1 1.3-.5 1.75-.35.2-.75.25-1.25.25z" />
      <circle cx="7.6" cy="11.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="7.3" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="7.6" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  shop: (
    <>
      <rect x="3.4" y="8.6" width="17.2" height="11.9" rx="2.2" />
      <path d="M3.4 13.2h17.2" />
      <path d="M12 8.6v11.9" />
      <path d="M12 8.6S10.9 4 8.5 4a2.3 2.3 0 0 0 0 4.6H12Z" />
      <path d="M12 8.6S13.1 4 15.5 4a2.3 2.3 0 0 1 0 4.6H12Z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 14.8a1.65 1.65 0 0 0 .33 1.82l.06.06a1.95 1.95 0 1 1-2.76 2.76l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51v.17a1.95 1.95 0 0 1-3.9 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a1.95 1.95 0 1 1-2.76-2.76l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2.9a1.95 1.95 0 0 1 0-3.9h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a1.95 1.95 0 1 1 2.76-2.76l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V2.9a1.95 1.95 0 0 1 3.9 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a1.95 1.95 0 1 1 2.76 2.76l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1h.17a1.95 1.95 0 0 1 0 3.9h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  // The points mark. Filled, because it reads as a currency sigil next to a number.
  spark: (
    <path
      d="M12 2.8c.62 4.05 2.35 5.78 6.4 6.4-4.05.62-5.78 2.35-6.4 6.4-.62-4.05-2.35-5.78-6.4-6.4 4.05-.62 5.78-2.35 6.4-6.4Z"
      fill="currentColor"
      stroke="none"
      transform="translate(0 3)"
    />
  ),
  box: (
    <>
      <path d="M20.5 8.4v7.2a1.8 1.8 0 0 1-.94 1.58l-6.7 3.66a1.8 1.8 0 0 1-1.72 0l-6.7-3.66A1.8 1.8 0 0 1 3.5 15.6V8.4a1.8 1.8 0 0 1 .94-1.58l6.7-3.66a1.8 1.8 0 0 1 1.72 0l6.7 3.66A1.8 1.8 0 0 1 20.5 8.4Z" />
      <path d="M3.8 7.3 12 11.8l8.2-4.5" />
      <path d="M12 11.8v8.9" />
    </>
  ),
  sparkles: (
    <>
      <path d="M8.4 3.2c.5 3.2 1.85 4.55 5.05 5.05-3.2.5-4.55 1.85-5.05 5.05-.5-3.2-1.85-4.55-5.05-5.05 3.2-.5 4.55-1.85 5.05-5.05Z" />
      <path d="M17 12.6c.32 2.05 1.18 2.9 3.23 3.22-2.05.33-2.91 1.18-3.23 3.23-.32-2.05-1.18-2.9-3.23-3.23 2.05-.32 2.91-1.17 3.23-3.22Z" />
    </>
  ),
  pencil: (
    <>
      <path d="M16.4 3.6a2.26 2.26 0 0 1 3.2 3.2L7.9 18.5 3.5 20l1.5-4.4Z" />
      <path d="M15 5 18.6 8.6" />
    </>
  ),
  check: <path d="M4.8 12.6 9.5 17.3 19.2 6.9" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19.2V5.2" />
      <path d="M6 11.2l6-6 6 6" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 4.8v14" />
      <path d="M18 12.8l-6 6-6-6" />
    </>
  ),
  chevronLeft: <path d="M14.8 5.4 8.2 12l6.6 6.6" />,
  chevronRight: <path d="M9.2 5.4 15.8 12l-6.6 6.6" />,
  lock: (
    <>
      <rect x="4.4" y="10.4" width="15.2" height="10.2" rx="2.4" />
      <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5.2a4 4 0 0 1-8 0Z" />
      <path d="M8 5.4H5.4v1.4a3 3 0 0 0 3 3" />
      <path d="M16 5.4h2.6v1.4a3 3 0 0 1-3 3" />
      <path d="M12 13.2v3.4" />
      <path d="M8.4 20.4h7.2" />
      <path d="M9.8 20.4c.3-2.4.9-3.8 2.2-3.8s1.9 1.4 2.2 3.8" />
    </>
  ),
  // Manual point adjustments. A wrench outline turns to mush at 17px; two
  // slider tracks stay readable.
  sliders: (
    <>
      <path d="M3.6 7.6h8.2" />
      <path d="M17.4 7.6h3" />
      <circle cx="14.6" cy="7.6" r="2.4" />
      <path d="M3.6 16.4h4.6" />
      <path d="M13.8 16.4h6.6" />
      <circle cx="11" cy="16.4" r="2.4" />
    </>
  ),
  square: <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" />,
  alert: (
    <>
      <path d="M10.4 4.1 2.6 17.4a1.85 1.85 0 0 0 1.6 2.8h15.6a1.85 1.85 0 0 0 1.6-2.8L13.6 4.1a1.85 1.85 0 0 0-3.2 0Z" />
      <path d="M12 9.4v3.8" />
      <path d="M12 16.6h.01" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({ name, size = 20, strokeWidth = 1.75, className = '', style }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {paths}
    </svg>
  );
}
