import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addTask,
  completeTask,
  deleteTask,
  updateTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  SIZE_POINTS,
} from '../db/actions.js';
import { floatPoints } from '../fx.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';
import useLongPress from '../useLongPress.js';
import Icon from '../components/Icon.jsx';

// Sizes get their own soft tints: bigger = warmer.
const SIZE_ACCENT = { S: 4, M: 3, L: 1 };

// Stable identity so a task with no subtasks doesn't get a fresh array (and a
// re-render) on every parent render.
const EMPTY = [];

export default function Tasks() {
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );
  // One open at a time, so the list can't grow out from under your thumb.
  // Held here rather than per-row precisely because opening one closes another.
  const [openId, setOpenId] = useState(null);
  // All subtasks in one query: a per-row query would mean one live subscription
  // per task, and the counts are needed on collapsed rows anyway.
  const subtasks = useLiveQuery(() => db.subtasks.filter((s) => !s.deleted).toArray(), [], []);
  const byTask = new Map();
  for (const s of subtasks) {
    if (!byTask.has(s.task_id)) byTask.set(s.task_id, []);
    byTask.get(s.task_id).push(s);
  }
  for (const list of byTask.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-2)' }} />
        To Do
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 'var(--weight-normal)' }}>
          {tasks.length} open
        </span>
      </h1>
      <AddTask />
      {tasks.length > 0 && (
        <div className="longpress-hint" style={{ marginTop: 'var(--space-2)' }}>
          <Icon name="pencil" size={12} /> hold a task to edit
        </div>
      )}
      <div style={{ marginTop: 'var(--space-4)' }}>
        {tasks.length === 0 && <p className="empty">Nothing to do. Suspicious.</p>}
        {tasks.map((t, i) => (
          <TaskRow
            key={t.id}
            task={t}
            index={i}
            subs={byTask.get(t.id) || EMPTY}
            open={openId === t.id}
            onToggleOpen={() => setOpenId(openId === t.id ? null : t.id)}
          />
        ))}
      </div>
    </>
  );
}

function AddTask() {
  const [title, setTitle] = useState('');
  const [size, setSize] = useState('M');

  async function submit(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await addTask(trimmed, size);
    setTitle('');
  }

  return (
    <form className="row" onSubmit={submit}>
      <input
        className="grow"
        placeholder="Add a task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <SizePicker value={size} onChange={setSize} />
      <button className="btn primary" type="submit" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}

export function SizePicker({ value, onChange }) {
  return (
    <div className="row" style={{ gap: 'var(--space-1)' }}>
      {Object.entries(SIZE_POINTS).map(([s, pts]) => (
        <button
          key={s}
          type="button"
          className="size-chip"
          onClick={() => onChange(s)}
          style={
            value === s
              ? {
                  background: `var(--accent-${SIZE_ACCENT[s]}-soft)`,
                  color: 'var(--text-primary)',
                }
              : undefined
          }
          title={`${pts} points`}
        >
          {s}·{pts}
        </button>
      ))}
    </div>
  );
}

export function SizeChip({ size, done = false }) {
  return (
    <span
      className="size-chip"
      style={done ? undefined : { background: `var(--accent-${SIZE_ACCENT[size]}-soft)` }}
    >
      {size}·{SIZE_POINTS[size]}
    </span>
  );
}

function TaskRow({ task, index, subs, open, onToggleOpen }) {
  const [editing, setEditing] = useState(false);
  const accent = itemAccent(task, index);
  // Editing used to open on a plain tap of the row, which made a mis-aimed
  // check feel like a trap. It's a hold now, same as the shop and habits;
  // a plain tap opens the subtask drawer.
  const { handlers, holding, consumedRef } = useLongPress(() => setEditing(true));

  const done = subs.filter((s) => s.done_at).length;

  async function complete(e) {
    floatPoints(e.currentTarget, SIZE_POINTS[task.size]);
    await completeTask(task);
  }

  if (editing) return <TaskEditor task={task} close={() => setEditing(false)} />;

  return (
    <div className="task-block">
      <div
        className={`list-item longpress${holding ? ' holding' : ''}${open ? ' open' : ''}`}
        style={{ borderLeft: `4px solid var(--accent-${accent})` }}
        {...handlers}
        // A completed hold also produces a click on release; without this
        // guard the drawer would open behind the editor every time.
        onClick={() => {
          if (consumedRef.current) return;
          onToggleOpen();
        }}
      >
        {/* The checkbox opts out of the hold: it's the row's primary action and
            holding it should do nothing, not open an editor. */}
        <span onPointerDown={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <Check on={false} accent={accent} onClick={complete} label={`Complete ${task.title}`} />
        </span>
        <div className="grow">
          <div className="item-title">{task.title}</div>
          {task.notes && <div className="muted">{task.notes}</div>}
        </div>
        {/* The count is the whole point of showing anything on a collapsed
            row — it says there's something inside without opening it. */}
        {subs.length > 0 && (
          <span className="subtask-count">
            {done}/{subs.length}
          </span>
        )}
        <SizeChip size={task.size} />
        <span className={`disclosure${open ? ' open' : ''}`} aria-hidden="true">
          <Icon name="chevronRight" size={15} />
        </span>
      </div>
      {open && <SubtaskDrawer task={task} subs={subs} accent={accent} />}
    </div>
  );
}

function SubtaskDrawer({ task, subs, accent }) {
  const [title, setTitle] = useState('');

  async function add(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await addSubtask(task.id, trimmed);
    setTitle('');
  }

  return (
    <div className="subtask-drawer" style={{ borderLeftColor: `var(--accent-${accent})` }}>
      {subs.length === 0 && <p className="empty">No steps yet.</p>}
      {subs.map((s) => (
        <div className="subtask-row" key={s.id}>
          <Check
            on={!!s.done_at}
            accent={accent}
            onClick={() => toggleSubtask(s)}
            label={s.title}
          />
          <span className={`grow${s.done_at ? ' subtask-done' : ''}`}>{s.title}</span>
          <button
            className="icon-btn"
            onClick={() => deleteSubtask(s.id)}
            aria-label={`Delete ${s.title}`}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <form className="row" onSubmit={add}>
        <input
          className="grow"
          placeholder="Add a step…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={!title.trim()}>
          Add
        </button>
      </form>
      {/* Says it once, where the question actually comes up. */}
      <p className="muted small">Steps are structure — they don't earn points.</p>
    </div>
  );
}

function TaskEditor({ task, close }) {
  const [title, setTitle] = useState(task.title);
  const [size, setSize] = useState(task.size);
  const [notes, setNotes] = useState(task.notes || '');
  const [color, setColor] = useState(task.color ?? null);

  async function save() {
    if (!title.trim()) return;
    await updateTask(task.id, { title: title.trim(), size, notes: notes.trim() || null, color });
    close();
  }

  return (
    <div className="sheet stack-sm" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        rows={2}
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="row spread wrap">
        <SizePicker value={size} onChange={setSize} />
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="row spread">
        <button
          className="btn danger"
          onClick={async () => {
            await deleteTask(task);
            close();
          }}
        >
          Delete
        </button>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
