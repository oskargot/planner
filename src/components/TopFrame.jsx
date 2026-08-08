import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { APP_NAME, matchNav } from '../config.js';
import { logicalDay } from '../db/time.js';
import { useBalance, useEarnedToday } from '../db/selectors.js';
import { summarise } from '../db/tumbler.js';
import Icon from './Icon.jsx';

/*
 * The phone's constant frame (design.md §2): one row, present on every
 * screen, same things in the same places. It grew out of Home's old header —
 * which was the only place the phone ever showed the balance or the way into
 * Settings — and it holds the three tiers of chrome:
 *
 *   1. Identical everywhere: search and the settings door, far right.
 *   2. Positionally fixed, contextually filled: the currency slot. A screen
 *      shows the currency it spends and never both — points everywhere,
 *      grit inside Rocks. There is deliberately no screen where the two
 *      numbers can be compared; the wall between the economies is drawn by
 *      the chrome itself, not just respected by the code.
 *   3. The section's own: everything below this row.
 *
 * The left slot is contextual too: the wordmark on Home, empty elsewhere.
 * The frame's height is set by the currency block, which renders two lines
 * in both modes — the row must never change height between sections, or the
 * muscle memory it exists for is spent re-aiming at the gear.
 *
 * Lives OUTSIDE the scrolling .page, so it stays put while a list scrolls
 * and never slides with the section animation. Hidden at ≥900px, where the
 * rail is the frame.
 */
export default function TopFrame({ onSearch }) {
  const location = useLocation();
  const { section } = matchNav(location.pathname);
  // Settings paths fall through matchNav to Home, so they read points —
  // Stats and the Ledger are both points-side screens.
  const gritMode = section.id === 'tumbler';
  const home = location.pathname === '/';

  const balance = useBalance();
  const earned = useEarnedToday();
  const ledger = useLiveQuery(() => db.tumbler_ledger.toArray(), [], []);
  const { grit } = summarise(ledger);
  const today = logicalDay();
  const gritToday = ledger.reduce(
    (sum, r) =>
      !r.deleted && r.delta > 0 && logicalDay(r.created_at) === today ? sum + r.delta : sum,
    0
  );

  return (
    <header className="top-frame">
      {home ? <span className="display wordmark">{APP_NAME}</span> : <span />}
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {gritMode ? (
          // "How am I doing" for grit is the Rocks dashboard — Stats shows no
          // grit on purpose, so the chip points home instead.
          <Link to="/tumbler" className="header-points" aria-label="Grit">
            <div className="balance grit">
              <Icon name="gem" size={17} /> {grit}
            </div>
            <div className="muted small">+{gritToday} today</div>
          </Link>
        ) : (
          <Link to="/settings/stats" className="header-points" aria-label="Points">
            <div className="balance">
              <Icon name="spark" size={18} /> {balance ?? '…'}
            </div>
            <div className="muted small">+{earned} today</div>
          </Link>
        )}
        <button className="frame-btn" onClick={onSearch} aria-label="Search">
          <Icon name="search" size={20} />
        </button>
        <Link to="/settings" className="frame-btn" aria-label="Settings">
          <Icon name="gear" size={22} />
        </Link>
      </div>
    </header>
  );
}
