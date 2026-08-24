import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { logicalDay, parseDay, monthLabel } from '../db/time.js';
import { habitDayStats, heatVar } from '../db/selectors.js';
import Icon from './Icon.jsx';

/*
 * The month heat calendar at card size — one cell per day, coloured by that
 * day's habit ratio. Extracted from Home's habits card when the Habits
 * dashboard arrived (design.md §1): its Month card is this same picture,
 * because the heat grid IS the Month page's real content at a glance.
 *
 * Two shapes, one calendar. By default the whole block is a link to the full
 * month. With `inlineLink`, only the label row is — the grid stays inert,
 * which is what the wall's Habits panel wants: it sits above tappable habit
 * rows, and a grid that swallows a tap meant for a cell is worse than one that
 * ignores it. (It also leaves the cells free to become day pickers later.)
 */
export default function MiniMonth({ inlineLink = false }) {
  const today = logicalDay();
  const d = parseDay(today);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
  });
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const stats = useLiveQuery(() => habitDayStats(days), [today], null);

  const grid = (
    <div className="heat-grid">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
        <div key={`w${i}`} className="heat-weekday">
          {w}
        </div>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <div key={`pad${i}`} className="heat-cell outside" />
      ))}
      {days.map((day) => {
        const future = day > today;
        const cls = `heat-cell${future ? ' future' : ''}${day === today ? ' today' : ''}`;
        return (
          <div
            key={day}
            className={cls}
            title={day}
            style={{
              background: future
                ? undefined
                : heatVar(stats?.get(day)?.ratio ?? 0, stats?.get(day)?.done ?? 0),
            }}
          >
            {Number(day.slice(-2))}
          </div>
        );
      })}
    </div>
  );

  if (inlineLink) {
    return (
      <div className="mini-month">
        <div className="month-head">
          <span className="month-label">{monthLabel(year, month)}</span>
          <Link to="/habits/month" className="month-more">
            full month
            <Icon name="chevronRight" size={12} />
          </Link>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <Link to="/habits/month" className="mini-month" aria-label="Open month view">
      <div className="month-label">{monthLabel(year, month)}</div>
      {grid}
    </Link>
  );
}
