import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addTask, completeTask, deleteTask, updateTask, SIZE_POINTS } from '../db/actions.js';
import { floatPoints } from '../fx.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';

// Sizes get their own soft tints: bigger = warmer.
const SIZE_ACCENT = { S: 4, M: 3, L: 1 };

export default function Tasks() {
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );

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
      <div style={{ marginTop: 'var(--space-4)' }}>
        {tasks.length === 0 && <p className="empty">Nothing to do. Suspicious.</p>}
        {tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} index={i} />
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

function TaskRow({ task, index }) {
  const [editing, setEditing] = useState(false);
  const accent = itemAccent(task, index);

  async function complete(e) {
    floatPoints(e.currentTarget, SIZE_POINTS[task.size]);
    await completeTask(task);
  }

  if (editing) return <TaskEditor task={task} close={() => setEditing(false)} />;

  return (
    <div className="list-item" style={{ borderLeft: `4px solid var(--accent-${accent})` }}>
      <Check on={false} accent={accent} onClick={complete} label={`Complete ${task.title}`} />
      <div className="grow" onClick={() => setEditing(true)}>
        <div className="item-title">{task.title}</div>
        {task.notes && <div className="muted">{task.notes}</div>}
      </div>
      <SizeChip size={task.size} />
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
