import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { logicalDay, parseDay, monthLabel } from '../db/time.js';
import { habitDayStats, heatVar } from '../db/selectors.js';

/*
 * The month heat calendar at card size — one cell per day, coloured by that
 * day's habit ratio. Extracted from Home's habits card when the Habits
 * dashboard arrived (design.md §1): its Month card is this same picture,
 * because the heat grid IS the Month page's real content at a glance.
 * Always a link to the full month view.
 */
export default function MiniMonth() {
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

  return (
    <Link to="/habits/month" className="mini-month" aria-label="Open month view">
      <div className="month-label">{monthLabel(year, month)}</div>
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
    </Link>
  );
}
