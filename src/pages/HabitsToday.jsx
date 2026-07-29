import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addHabit, updateHabit, deleteHabit, checkHabit, uncheckHabit } from '../db/actions.js';
import { logicalDay, addDays, isEditableDay, prettyDay } from '../db/time.js';
import { floatPoints, confettiBurst } from '../fx.js';
import Check from '../components/Check.jsx';

export default function HabitsToday() {
  const [day, setDay] = useState(logicalDay());
  const [manage, setManage] = useState(false);
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
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => setManage(!manage)}
          aria-label="Manage habits"
        >
          {manage ? 'done' : '✎'}
        </button>
      </h1>

      <div className="stepper">
        <button onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">‹</button>
        <div className="day-label">
          {prettyDay(day)}
          <div className="muted">{day}</div>
        </div>
        <button onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label="Next day">
          ›
        </button>
      </div>

      {!editable && <div className="locked-note">🔒 Outside the backfill window — read only</div>}

      {habits.length === 0 && !manage && (
        <p className="empty">No habits yet. Tap ✎ to add your first.</p>
      )}

      {habits.map((h) =>
        manage ? (
          <HabitEditor key={h.id} habit={h} />
        ) : (
          <div className="list-item" key={h.id} style={{ padding: 'var(--space-4)' }}>
            <Check
              on={doneIds.has(h.id)}
              accent={3}
              round
              disabled={!editable}
              onClick={(e) => toggle(h, e)}
              label={h.name}
            />
            <span style={{ fontSize: 'var(--size-xl)' }}>{h.emoji}</span>
            <span className="item-title grow">{h.name}</span>
          </div>
        )
      )}

      {manage && <AddHabit />}
    </>
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

function HabitEditor({ habit }) {
  const [name, setName] = useState(habit.name);
  const [emoji, setEmoji] = useState(habit.emoji || '');

  return (
    <div className="list-item">
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
        ✕
      </button>
    </div>
  );
}
