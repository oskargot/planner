import { useState } from 'react';
import {
  addChore,
  updateChore,
  deleteChore,
  restoreChore,
  checkChore,
  uncheckChore,
  moveRow,
  SIZE_POINTS,
} from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import { useChores, choreStatus } from '../db/selectors.js';
import { floatPoints } from '../fx.js';
import { showToast } from '../toast.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';
import useLongPress from '../useLongPress.js';
import { SizePicker } from './Tasks.jsx';

/*
 * Chores: recurring quest-like work — regular, but not daily the way a habit
 * is. The design rule the whole screen leans on: a chore runs on a COOLDOWN,
 * never a schedule. Checking one starts its rest; when the rest is over it's
 * simply ready again and waits forever. Nothing on this page can be overdue,
 * so there are no dates, no red, and no state after "ready".
 *
 * Ready and done-today rows stay in place at the top (so a just-checked row
 * doesn't jump out from under the toast's undo); resting rows sink below,
 * dimmed, ordered by when they come back.
 */
export default function Chores() {
  const today = logicalDay();
  const { chores, lastDone } = useChores();

  const withStatus = chores.map((chore, index) => ({
    chore,
    index,
    status: choreStatus(chore, lastDone.get(chore.id), today),
  }));
  const front = withStatus.filter((x) => x.status.state !== 'resting');
  const resting = withStatus
    .filter((x) => x.status.state === 'resting')
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft);

  return (
    <>
      <h1 className="page-title">
        {/* Habits' accent: chores are a sub-page of that section now, and the
            dot has to agree with the sub-tab row above it. */}
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Chores
        {chores.length > 0 && (
          <span className="longpress-hint" style={{ marginLeft: 'auto' }}>
            <Icon name="pencil" size={12} />
            <span className="hint-touch">hold to edit</span>
            <span className="hint-pointer">right-click to edit</span>
          </span>
        )}
      </h1>

      {chores.length === 0 && (
        <p className="empty">
          Regular work that isn't daily — do one and it rests, then it's ready
          again. Add your first below.
        </p>
      )}

      {front.map(({ chore, index, status }) => (
        <ChoreRow key={chore.id} chore={chore} index={index} status={status} siblings={chores} today={today} />
      ))}

      {resting.length > 0 && (
        <>
          <h2 className="section-heading" style={{ marginTop: 'var(--space-4)' }}>
            Resting
          </h2>
          {resting.map(({ chore, index, status }) => (
            <ChoreRow key={chore.id} chore={chore} index={index} status={status} siblings={chores} today={today} />
          ))}
        </>
      )}

      <AddChore />
    </>
  );
}

function ChoreRow({ chore, index, status, siblings, today }) {
  const [editing, setEditing] = useState(false);
  const { handlers, holding } = useLongPress(() => setEditing(true));
  const accent = itemAccent(chore, index);
  const done = status.state === 'done';
  const resting = status.state === 'resting';

  async function toggle(e) {
    if (done) {
      await uncheckChore(chore, today);
    } else if (status.state === 'ready') {
      floatPoints(e.currentTarget, SIZE_POINTS[chore.size] ?? 0);
      await checkChore(chore, today);
    }
  }

  if (editing)
    return (
      <ChoreEditor chore={chore} index={index} siblings={siblings} close={() => setEditing(false)} />
    );

  return (
    <div
      className={`list-item longpress${holding ? ' holding' : ''}`}
      style={{
        borderLeft: `4px solid var(--accent-${accent})`,
        background: done ? `var(--accent-${accent}-soft)` : undefined,
        opacity: resting ? 0.6 : undefined,
      }}
      {...handlers}
    >
      {/* Checking is the row's primary action — holding the box shouldn't
          turn into an edit. A resting chore's box is disabled: the cooldown
          is the anti-farm wall, the same job the zero-point rule does for
          subtasks. */}
      <span onPointerDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <Check
          on={done}
          accent={accent}
          round
          disabled={resting}
          onClick={toggle}
          label={chore.name}
        />
      </span>
      {chore.emoji && <span style={{ fontSize: 'var(--size-xl)' }}>{chore.emoji}</span>}
      <span className="item-title grow">{chore.name}</span>
      {resting ? (
        <span className="muted small">back in {status.daysLeft}d</span>
      ) : (
        status.state === 'ready' &&
        status.since != null && (
          // Quiet fact, not a nag: how long it's been, only once it's been a
          // while past ready. Never "overdue" — there is no such thing here.
          status.since >= chore.interval_days * 2 && (
            <span className="muted small">{status.since}d since</span>
          )
        )
      )}
    </div>
  );
}

function AddChore() {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [days, setDays] = useState(7);
  const [size, setSize] = useState('S');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addChore(name.trim(), {
      emoji: emoji.trim() || null,
      size,
      intervalDays: Math.max(1, Number(days) || 7),
    });
    setName('');
    setEmoji('');
  }

  return (
    <form className="row wrap" style={{ marginTop: 'var(--space-3)' }} onSubmit={submit}>
      <input
        style={{ width: 56, textAlign: 'center' }}
        placeholder="🧹"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        className="grow"
        placeholder="New chore…"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <IntervalInput value={days} onChange={setDays} />
      <SizePicker value={size} onChange={setSize} />
      <button className="btn primary" type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

// "every N days" — one number, no schedule, no weekday picker. The number is
// a rhythm, not an appointment.
function IntervalInput({ value, onChange, onBlur }) {
  return (
    <label className="row" style={{ gap: 'var(--space-1)' }}>
      <span className="muted small">every</span>
      <input
        type="number"
        min="1"
        max="365"
        inputMode="numeric"
        style={{ width: 58, textAlign: 'center' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <span className="muted small">days</span>
    </label>
  );
}

function ChoreEditor({ chore, index, siblings, close }) {
  const [name, setName] = useState(chore.name);
  const [emoji, setEmoji] = useState(chore.emoji || '');
  const [days, setDays] = useState(chore.interval_days);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <div
      className="list-item wrap"
      style={{ borderLeft: `4px solid var(--accent-${itemAccent(chore, index)})` }}
    >
      <input
        style={{ width: 56, textAlign: 'center' }}
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={() => updateChore(chore.id, { emoji: emoji.trim() || null })}
      />
      <input
        className="grow"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && updateChore(chore.id, { name: name.trim() })}
      />
      <IntervalInput
        value={days}
        onChange={setDays}
        onBlur={() => {
          const n = Math.max(1, Number(days) || chore.interval_days);
          setDays(n);
          updateChore(chore.id, { interval_days: n });
        }}
      />
      <SizePicker value={chore.size} onChange={(s) => updateChore(chore.id, { size: s })} />
      <ColorPicker
        value={chore.color ?? null}
        onChange={(c) => updateChore(chore.id, { color: c })}
      />
      <button
        className="icon-btn"
        disabled={!prev}
        onClick={() => moveRow('chores', chore, prev, true)}
        aria-label="Move up"
      >
        <Icon name="arrowUp" size={16} />
      </button>
      <button
        className="icon-btn"
        disabled={!next}
        onClick={() => moveRow('chores', chore, next, false)}
        aria-label="Move down"
      >
        <Icon name="arrowDown" size={16} />
      </button>
      <button
        className="icon-btn"
        title="Delete chore (history and points stay)"
        onClick={() => {
          deleteChore(chore.id);
          close();
          showToast(`Deleted “${chore.name}” — its points stay`, {
            undo: () => restoreChore(chore.id),
          });
        }}
      >
        <Icon name="trash" size={16} />
      </button>
      {/* Inputs save on blur, so this only dismisses. */}
      <button className="btn primary" onClick={close}>
        Done
      </button>
    </div>
  );
}
