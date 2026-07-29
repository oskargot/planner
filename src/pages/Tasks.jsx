import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addTask, completeTask, deleteTask, updateTask, SIZE_POINTS } from '../db/actions.js';
import { floatPoints } from '../fx.js';
import Check from '../components/Check.jsx';

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
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
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
              ? { background: 'var(--accent-2-soft)', color: 'var(--text-primary)' }
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

function TaskRow({ task }) {
  const [editing, setEditing] = useState(false);

  async function complete(e) {
    floatPoints(e.currentTarget, SIZE_POINTS[task.size]);
    await completeTask(task);
  }

  if (editing) return <TaskEditor task={task} close={() => setEditing(false)} />;

  return (
    <div className="list-item">
      <Check on={false} accent={2} onClick={complete} label={`Complete ${task.title}`} />
      <div className="grow" onClick={() => setEditing(true)}>
        <div className="item-title">{task.title}</div>
        {task.notes && <div className="muted">{task.notes}</div>}
      </div>
      <span className="size-chip">
        {task.size}·{SIZE_POINTS[task.size]}
      </span>
    </div>
  );
}

function TaskEditor({ task, close }) {
  const [title, setTitle] = useState(task.title);
  const [size, setSize] = useState(task.size);
  const [notes, setNotes] = useState(task.notes || '');

  async function save() {
    if (!title.trim()) return;
    await updateTask(task.id, { title: title.trim(), size, notes: notes.trim() || null });
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
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button
            className="btn danger"
            onClick={async () => {
              await deleteTask(task);
              close();
            }}
          >
            Delete
          </button>
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
