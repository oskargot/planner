import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { habitDayStats, heatVar } from '../db/selectors.js';
import { logicalDay, monthLabel, parseDay } from '../db/time.js';

// The temperature map (§7): one cell per day, fill intensity =
// habits done / habits active THAT day, riding the theme's heat ramp.
export default function HabitsMonth() {
  const today = logicalDay();
  const [ym, setYm] = useState(() => {
    const d = parseDay(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(null);

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
  });
  // Monday-first column offset for the 1st.
  const offset = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7;

  const stats = useLiveQuery(() => habitDayStats(days), [ym.y, ym.m], null);

  function step(n) {
    const m = ym.m + n;
    setYm({ y: ym.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
    setSelected(null);
  }

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Month
      </h1>

      <div className="stepper">
        <button onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <div className="day-label">{monthLabel(ym.y, ym.m)}</div>
        <button onClick={() => step(1)} aria-label="Next month">›</button>
      </div>

      <div className="heat-grid" style={{ marginBottom: 'var(--space-2)' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="muted" style={{ textAlign: 'center' }}>
            {d}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} className="heat-cell outside" />
        ))}
        {days.map((day) => {
          const s = stats?.get(day);
          const future = day > today;
          return (
            <button
              key={day}
              className={`heat-cell${selected === day ? ' selected' : ''}${future ? ' future' : ''}`}
              style={{ background: future ? undefined : heatVar(s?.ratio ?? 0, s?.done ?? 0) }}
              onClick={() => !future && setSelected(day === selected ? null : day)}
            >
              {Number(day.slice(-2))}
            </button>
          );
        })}
      </div>

      {selected && <DayDetail day={selected} stat={stats?.get(selected)} />}
    </>
  );
}

function DayDetail({ day, stat }) {
  const habits = useLiveQuery(() => db.habits.toArray(), [], []);
  const entries = useLiveQuery(
    () => db.habit_entries.where('day').equals(day).filter((e) => !e.deleted).toArray(),
    [day],
    []
  );
  const doneIds = new Set(entries.map((e) => e.habit_id));
  const shown = habits.filter((h) => doneIds.has(h.id) || (!h.deleted && h.active));

  return (
    <div className="sheet">
      <div className="row spread" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="bold display">{day}</span>
        <span className="muted">
          {stat ? `${stat.done}/${stat.active}` : ''}
        </span>
      </div>
      <div className="stack-sm">
        {shown.map((h) => (
          <div className="row" key={h.id}>
            <span>{doneIds.has(h.id) ? '✅' : '⬜'}</span>
            <span>{h.emoji}</span>
            <span className={doneIds.has(h.id) ? '' : 'muted'}>{h.name}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="muted">No habits existed yet.</div>}
      </div>
    </div>
  );
}
