import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addHabit, updateHabit, deleteHabit, checkHabit, uncheckHabit } from '../db/actions.js';
import { logicalDay, addDays, isEditableDay, prettyDay } from '../db/time.js';
import { floatPoints, confettiBurst } from '../fx.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';
import useLongPress from '../useLongPress.js';

export default function HabitsToday() {
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

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Habits
        {/* The manage-mode toggle lived here. Editing is a hold on the row it
            belongs to now, so there's no mode to be in and no button. */}
        {habits.length > 0 && (
          <span className="longpress-hint" style={{ marginLeft: 'auto' }}>
            <Icon name="pencil" size={12} /> hold to edit
          </span>
        )}
      </h1>

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
          done={doneIds.has(h.id)}
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
}

function HabitRow({ habit, index, done, editable, onToggle }) {
  const [editing, setEditing] = useState(false);
  const { handlers, holding } = useLongPress(() => setEditing(true));
  const accent = itemAccent(habit, index);

  if (editing) return <HabitEditor habit={habit} index={index} close={() => setEditing(false)} />;

  return (
    <div
      className={`list-item longpress${holding ? ' holding' : ''}`}
      style={{
        padding: 'var(--space-4)',
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

function HabitEditor({ habit, index, close }) {
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji || '');

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
        className="btn"
        title="Archive — keeps history"
        onClick={() => updateHabit(habit.id, { active: 0 })}
      >
        Archive
      </button>
      <button
        className="icon-btn"
        title="Delete habit (history and points stay)"
        onClick={() => {
          if (confirm(`Delete habit "${habit.name}"? Its history and points stay.`)) {
            deleteHabit(habit.id);
          }
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
