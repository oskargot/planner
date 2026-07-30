import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addHabit,
  updateHabit,
  deleteHabit,
  restoreHabit,
  checkHabit,
  uncheckHabit,
  moveRow,
} from '../db/actions.js';
import { logicalDay, addDays, isEditableDay, prettyDay, parseDay, monthLabel } from '../db/time.js';
import { habitDayStats, heatVar, useHabitStreaks } from '../db/selectors.js';
import { floatPoints, confettiBurst } from '../fx.js';
import { showToast } from '../toast.js';
import { useWide } from '../useMediaQuery.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';
import useLongPress from '../useLongPress.js';

export default function HabitsToday() {
  const wide = useWide();
  const [day, setDay] = useState(logicalDay());
  const editable = isEditableDay(day);
  const today = logicalDay();

  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deleted && !!h.active).sortBy('sort_order'),
    [],
    []
  );
  const entries = useLiveQuery(
    () => db.habit_entries.where('day').equals(day).filter((e) => !e.deleted).toArray(),
    [day],
    []
  );
  const streaks = useHabitStreaks();
  const doneIds = new Set(entries.map((e) => e.habit_id));

  async function toggle(habit, e) {
    if (!editable) return;
    if (doneIds.has(habit.id)) {
      await uncheckHabit(habit.id, day);
    } else {
      floatPoints(e.currentTarget, 1);
      await checkHabit(habit.id, day);
      // full-habit day → a little celebration (§8)
      if (doneIds.size + 1 === habits.length && habits.length > 1) {
        confettiBurst(e.currentTarget);
      }
    }
  }

  const rows = (
    <>
      <div className="stepper">
        <button onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
          <Icon name="chevronLeft" size={18} />
        </button>
        <div className="day-label">
          {prettyDay(day)}
          <div className="muted">{day}</div>
        </div>
        <button onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label="Next day">
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      {!editable && (
        <div className="locked-note">
          <Icon name="lock" size={15} /> Outside the backfill window — read only
        </div>
      )}

      {habits.length === 0 && <p className="empty">No habits yet. Add your first below.</p>}

      {habits.map((h, i) => (
        <HabitRow
          key={h.id}
          habit={h}
          index={i}
          siblings={habits}
          done={doneIds.has(h.id)}
          streak={streaks?.get(h.id)?.streak ?? 0}
          editable={editable}
          onToggle={toggle}
        />
      ))}

      {/* Always on screen now. The add form used to be gated behind manage
          mode, and with the mode gone it has to live somewhere — a single
          input row at the bottom is quieter than a toggle in the title. */}
      <AddHabit />
    </>
  );

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Habits
        {/* The manage-mode toggle lived here. Editing is a hold on the row it
            belongs to now, so there's no mode to be in and no button. */}
        {habits.length > 0 && (
          <span className="longpress-hint" style={{ marginLeft: 'auto' }}>
            <Icon name="pencil" size={12} />
            <span className="hint-touch">hold to edit</span>
            <span className="hint-pointer">right-click to edit</span>
          </span>
        )}
      </h1>

      {/* Wide screens put the month beside the day. Today and Month were two
          nearly-empty pages showing two halves of one thing — which is the
          right call on a phone, where neither half fits beside the other, and
          never was on the iPad. */}
      {wide ? (
        <div className="habits-page-split">
          <div>{rows}</div>
          <MonthPanel day={day} today={today} onPick={setDay} />
        </div>
      ) : (
        rows
      )}
    </>
  );
}

/*
 * The month, beside the rows. Days inside the backfill window are buttons —
 * this is a faster stepper, not a second way to edit history. Everything older
 * stays inert, which is the rule the stepper has always enforced; the calendar
 * just makes it visible.
 */
function MonthPanel({ day, today, onPick }) {
  const d = parseDay(day);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from(
    { length: daysInMonth },
    (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  );
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const stats = useLiveQuery(() => habitDayStats(days), [year, month, today], null);

  return (
    <aside className="month-panel">
      <div className="row spread" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="bold display">{monthLabel(year, month)}</span>
        <Link className="card-link" to="/habits/month">
          full month <Icon name="chevronRight" size={13} />
        </Link>
      </div>
      <div className="heat-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <div key={`w${i}`} className="heat-weekday">
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad${i}`} className="heat-cell outside" />
        ))}
        {days.map((d2) => {
          const future = d2 > today;
          const pickable = isEditableDay(d2);
          const s = stats?.get(d2);
          const cls = `heat-cell${future ? ' future' : ''}${d2 === today ? ' today' : ''}${
            d2 === day ? ' selected' : ''
          }`;
          const style = { background: future ? undefined : heatVar(s?.ratio ?? 0, s?.done ?? 0) };
          return pickable ? (
            <button key={d2} className={cls} style={style} onClick={() => onPick(d2)} title={d2}>
              {Number(d2.slice(-2))}
            </button>
          ) : (
            <div key={d2} className={cls} style={style} title={d2}>
              {Number(d2.slice(-2))}
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 'var(--space-3)' }}>
        Today and the two days before it can still be filled in.
      </p>
    </aside>
  );
}

function HabitRow({ habit, index, siblings, done, streak, editable, onToggle }) {
  const [editing, setEditing] = useState(false);
  const { handlers, holding } = useLongPress(() => setEditing(true));
  const accent = itemAccent(habit, index);

  if (editing)
    return (
      <HabitEditor habit={habit} index={index} siblings={siblings} close={() => setEditing(false)} />
    );

  return (
    <div
      className={`list-item longpress${holding ? ' holding' : ''}`}
      style={{
        borderLeft: `4px solid var(--accent-${accent})`,
        background: done ? `var(--accent-${accent}-soft)` : undefined,
      }}
      {...handlers}
    >
      {/* Checking is the row's primary action — holding the box shouldn't
          turn into an edit. */}
      <span onPointerDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <Check
          on={done}
          accent={accent}
          round
          disabled={!editable}
          onClick={(e) => onToggle(habit, e)}
          label={habit.name}
        />
      </span>
      <span style={{ fontSize: 'var(--size-xl)' }}>{habit.emoji}</span>
      <span className="item-title grow">{habit.name}</span>
      {/* The greeting has only ever known one streak, counted across all
          habits at once. This is the streak that belongs to the row you're
          looking at, which is the one that makes checking the box today rather
          than tomorrow feel like it matters. From two days up: "1 day in a
          row" is not a streak. */}
      {streak > 1 && (
        <span className="streak" title={`${streak} days in a row`}>
          <Icon name="sparkles" size={13} /> {streak}
        </span>
      )}
    </div>
  );
}

function AddHabit() {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addHabit(name.trim(), emoji.trim() || null);
    setName('');
    setEmoji('');
  }

  return (
    <form className="row" style={{ marginTop: 'var(--space-3)' }} onSubmit={submit}>
      <input
        style={{ width: 56, textAlign: 'center' }}
        placeholder="✨"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        className="grow"
        placeholder="New habit…"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn primary" type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

function HabitEditor({ habit, index, siblings, close }) {
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji || '');
  const prev = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <div
      className="list-item wrap"
      style={{ borderLeft: `4px solid var(--accent-${itemAccent(habit, index)})` }}
    >
      <input
        style={{ width: 56, textAlign: 'center' }}
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={() => updateHabit(habit.id, { emoji: emoji.trim() || null })}
      />
      <input
        className="grow"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && updateHabit(habit.id, { name: name.trim() })}
      />
      <ColorPicker
        value={habit.color ?? null}
        onChange={(c) => updateHabit(habit.id, { color: c })}
      />
      <button
        className="icon-btn"
        disabled={!prev}
        onClick={() => moveRow('habits', habit, prev, true)}
        aria-label="Move up"
      >
        <Icon name="arrowUp" size={16} />
      </button>
      <button
        className="icon-btn"
        disabled={!next}
        onClick={() => moveRow('habits', habit, next, false)}
        aria-label="Move down"
      >
        <Icon name="arrowDown" size={16} />
      </button>
      <button
        className="btn"
        title="Archive — keeps history, and it's on the Archived page"
        onClick={() => {
          updateHabit(habit.id, { active: 0 });
          close();
          showToast(`Archived “${habit.name}”`, {
            undo: () => updateHabit(habit.id, { active: 1 }),
          });
        }}
      >
        Archive
      </button>
      {/* No confirm() any more. The toast is the confirmation, and unlike a
          dialog it arrives after you can see what actually happened. */}
      <button
        className="icon-btn"
        title="Delete habit (history and points stay)"
        onClick={() => {
          deleteHabit(habit.id);
          close();
          showToast(`Deleted “${habit.name}” — its points stay`, {
            undo: () => restoreHabit(habit.id),
          });
        }}
      >
        <Icon name="trash" size={16} />
      </button>
      {/* The name and emoji inputs save on blur, so this only dismisses. */}
      <button className="btn primary" onClick={close}>
        Done
      </button>
    </div>
  );
}
