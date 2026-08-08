import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  restoreTask,
  updateTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  moveRow,
  SIZE_POINTS,
  taskPoints,
} from '../db/actions.js';
import { logicalDay, daysBetween } from '../db/time.js';
import { floatPoints } from '../fx.js';
import { showToast } from '../toast.js';
import { useWide } from '../useMediaQuery.js';
import Check from '../components/Check.jsx';
import ColorPicker, { itemAccent } from '../components/ColorPicker.jsx';
import useLongPress from '../useLongPress.js';
import Icon from '../components/Icon.jsx';

// Sizes get their own soft tints: bigger = warmer.
const SIZE_ACCENT = { S: 4, M: 3, L: 1 };

// Stable identity so a task with no subtasks doesn't get a fresh array (and a
// re-render) on every parent render.
const EMPTY = [];

/*
 * Grouping. "Age" buckets by when the task was written down, which is the only
 * date this app keeps — there are no due dates and there aren't going to be.
 * It answers "what have I been carrying around for a month", which is a
 * different and more useful question than "what's overdue".
 */
const GROUPS = {
  none: { label: 'None', of: () => null },
  size: {
    label: 'Size',
    of: (t) => ({ L: 'Large', M: 'Medium', S: 'Small' })[t.size] ?? 'Other',
    order: ['Large', 'Medium', 'Small', 'Other'],
  },
  age: {
    label: 'Age',
    of: (t) => {
      const days = daysBetween(logicalDay(t.created_at), logicalDay());
      if (days <= 0) return 'Today';
      if (days <= 7) return 'This week';
      if (days <= 30) return 'This month';
      return 'Older';
    },
    order: ['Today', 'This week', 'This month', 'Older'],
  },
};

export default function Tasks() {
  const wide = useWide();
  const location = useLocation();
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );
  // One open at a time, so the list can't grow out from under your thumb.
  // Held here rather than per-row precisely because opening one closes another.
  const [openId, setOpenId] = useState(null);
  // Wide screens don't use the drawer at all — the pane is the drawer, and it
  // stays put while you work down the list.
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [sizes, setSizes] = useState(() => new Set());
  const [group, setGroup] = useState('none');
  const addRef = useRef(null);

  // All subtasks in one query: a per-row query would mean one live subscription
  // per task, and the counts are needed on collapsed rows anyway.
  const subtasks = useLiveQuery(() => db.subtasks.filter((s) => !s.deleted).toArray(), [], []);
  const byTask = new Map();
  for (const s of subtasks) {
    if (!byTask.has(s.task_id)) byTask.set(s.task_id, []);
    byTask.get(s.task_id).push(s);
  }
  for (const list of byTask.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  // The `n` shortcut lands here. The timestamp in location.state changes on
  // every press, so pressing it while already on the page still fires.
  useEffect(() => {
    if (location.state?.focusAdd) addRef.current?.focus();
  }, [location.state?.focusAdd]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (sizes.size && !sizes.has(t.size)) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
    });
  }, [tasks, query, sizes]);

  // Selection follows the list: if the selected task is completed, filtered
  // out or deleted, the pane says so rather than showing a stale row.
  const selected = filtered.find((t) => t.id === selectedId) ?? null;

  const groups = useMemo(() => {
    const g = GROUPS[group];
    if (group === 'none') return [{ key: null, tasks: filtered }];
    const map = new Map();
    for (const t of filtered) {
      const key = g.of(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return (g.order ?? [...map.keys()])
      .filter((k) => map.has(k))
      .map((k) => ({ key: k, tasks: map.get(k) }));
  }, [filtered, group]);

  const filtering = query.trim() || sizes.size > 0;

  const list = (
    <>
      <AddTask inputRef={addRef} />
      <Toolbar
        query={query}
        setQuery={setQuery}
        sizes={sizes}
        setSizes={setSizes}
        group={group}
        setGroup={setGroup}
      />
      <div style={{ marginTop: 'var(--space-3)' }}>
        {tasks.length === 0 && <p className="empty">Nothing to do. Suspicious.</p>}
        {tasks.length > 0 && filtered.length === 0 && <p className="empty">Nothing matches that.</p>}
        {groups.map((g) => (
          <section key={g.key ?? 'all'} className="task-group">
            {g.key && <h2 className="group-heading">{g.key}</h2>}
            {g.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                index={tasks.indexOf(t)}
                subs={byTask.get(t.id) || EMPTY}
                wide={wide}
                open={!wide && openId === t.id}
                selected={wide && selectedId === t.id}
                onToggleOpen={() => {
                  if (wide) setSelectedId(t.id);
                  else setOpenId(openId === t.id ? null : t.id);
                }}
              />
            ))}
          </section>
        ))}
      </div>
      {!wide && tasks.length > 0 && (
        <div className="longpress-hint" style={{ marginTop: 'var(--space-3)' }}>
          <Icon name="pencil" size={12} />
          <span className="hint-touch">hold a task to edit</span>
          <span className="hint-pointer">right-click a task to edit</span>
        </div>
      )}
    </>
  );

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-2)' }} />
        To Do
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 'var(--weight-normal)' }}>
          {filtering ? `${filtered.length} of ${tasks.length}` : `${tasks.length} open`}
        </span>
      </h1>

      {wide ? (
        <div className="split">
          <div className="split-list">{list}</div>
          <div className="split-detail">
            {selected ? (
              <TaskDetail
                key={selected.id}
                task={selected}
                subs={byTask.get(selected.id) || EMPTY}
                accent={itemAccent(selected, tasks.indexOf(selected))}
                siblings={tasks}
                onGone={() => setSelectedId(null)}
              />
            ) : (
              <div className="split-empty">
                <Icon name="tasks" size={26} />
                <p>Pick a task to see its steps.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        list
      )}
    </>
  );
}

/*
 * Filters. The search box is the one that earns its place every day; the size
 * chips and the grouping are for the afternoons when the list has got long
 * enough to hide from.
 */
function Toolbar({ query, setQuery, sizes, setSizes, group, setGroup }) {
  function toggleSize(s) {
    const next = new Set(sizes);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSizes(next);
  }

  return (
    <div className="toolbar">
      <label className="toolbar-search">
        <Icon name="search" size={15} />
        <input
          className="grow"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter tasks"
        />
        {query && (
          <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear filter">
            <Icon name="close" size={13} />
          </button>
        )}
      </label>

      <div className="row" style={{ gap: 'var(--space-1)' }}>
        {Object.keys(SIZE_POINTS).map((s) => (
          <button
            key={s}
            className="size-chip"
            onClick={() => toggleSize(s)}
            aria-pressed={sizes.has(s)}
            title={`Only ${s} tasks`}
            style={
              sizes.has(s)
                ? {
                    background: `var(--accent-${SIZE_ACCENT[s]}-soft)`,
                    color: 'var(--text-primary)',
                  }
                : undefined
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 'var(--space-1)' }}>
        <Icon name="filter" size={14} />
        {Object.entries(GROUPS).map(([key, g]) => (
          <button
            key={key}
            className="size-chip"
            onClick={() => setGroup(key)}
            aria-pressed={group === key}
            style={
              group === key
                ? { background: 'var(--accent-2-soft)', color: 'var(--text-primary)' }
                : undefined
            }
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AddTask({ inputRef }) {
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
        ref={inputRef}
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

/*
 * The locked worth of a gacha task, shown where the size picker would be.
 * Locked on purpose: an editable worth would make the machine theater. The
 * roll is the roll.
 */
function GachaWorth({ task }) {
  return (
    <span className="size-chip gacha-worth" title="Rolled by the gacha — can't be changed">
      <Icon name="capsule" size={13} /> worth {task.gacha_points}
    </span>
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

/*
 * Completing a task, with its undo attached. Shared with Home so both places
 * offer the same take-back — a mis-tapped checkbox on the dashboard is at
 * least as likely as one on the list.
 *
 * The float fires before the await so the number leaves the checkbox when it's
 * tapped rather than after a database round trip.
 */
export async function completeWithUndo(task, el) {
  floatPoints(el, taskPoints(task));
  await completeTask(task);
  showToast(`Completed “${task.title}”`, { undo: () => uncompleteTask(task) });
}

function TaskRow({ task, index, subs, open, selected, wide, onToggleOpen }) {
  const [editing, setEditing] = useState(false);
  const accent = itemAccent(task, index);
  // Editing used to open on a plain tap of the row, which made a mis-aimed
  // check feel like a trap. It's a hold now, same as the shop and habits;
  // a plain tap opens the subtask drawer. On a wide screen there's a whole
  // pane showing the same fields, so the hold has nothing left to open.
  const { handlers, holding, consumedRef } = useLongPress(() => setEditing(true), {
    disabled: wide,
  });

  const done = subs.filter((s) => s.done_at).length;

  if (editing) return <TaskEditor task={task} close={() => setEditing(false)} />;

  return (
    <div className="task-block">
      <div
        className={`list-item longpress${holding ? ' holding' : ''}${open ? ' open' : ''}${
          selected ? ' selected' : ''
        }`}
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
          <Check
            on={false}
            accent={accent}
            onClick={(e) => completeWithUndo(task, e.currentTarget)}
            label={`Complete ${task.title}`}
          />
        </span>
        <div className="grow">
          <div className="item-title">{task.title}</div>
          {task.notes && <div className="muted">{task.notes}</div>}
        </div>
        {/* The count is the whole point of showing anything on a collapsed
            row — it says there's something inside without opening it.
            The size chip used to sit beside it and doesn't any more: what a
            task is worth is something you set once, not something worth
            reading on every row, every time. It's in the editor. */}
        {subs.length > 0 && (
          <span className="subtask-count">
            {done}/{subs.length}
          </span>
        )}
        <span className={`disclosure${open ? ' open' : ''}`} aria-hidden="true">
          <Icon name="chevronRight" size={15} />
        </span>
      </div>
      {open && <SubtaskDrawer task={task} subs={subs} accent={accent} />}
    </div>
  );
}

function SubtaskList({ task, subs, accent }) {
  const [title, setTitle] = useState('');

  async function add(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await addSubtask(task.id, trimmed);
    setTitle('');
  }

  return (
    <>
      {subs.length === 0 && <p className="empty">No steps yet.</p>}
      {subs.map((s) => (
        <div className="subtask-row" key={s.id}>
          <Check on={!!s.done_at} accent={accent} onClick={() => toggleSubtask(s)} label={s.title} />
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
    </>
  );
}

function SubtaskDrawer({ task, subs, accent }) {
  return (
    <div className="subtask-drawer" style={{ borderLeftColor: `var(--accent-${accent})` }}>
      <SubtaskList task={task} subs={subs} accent={accent} />
    </div>
  );
}

/*
 * The wide-screen detail pane. Everything the long-press editor holds, plus the
 * subtasks, in a column that stays put while you work down the list — which is
 * the whole argument for the iPad layout.
 *
 * Nothing here is modal and there is no Save button: fields commit on blur, so
 * clicking another task can't lose an edit and can't trap you either.
 */
function TaskDetail({ task, subs, accent, siblings, onGone }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || '');

  const index = siblings.findIndex((t) => t.id === task.id);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];

  async function remove() {
    await deleteTask(task);
    onGone();
    showToast(`Deleted “${task.title}”`, { undo: () => restoreTask(task) });
  }

  return (
    <div className="detail" style={{ '--detail-accent': `var(--accent-${accent})` }}>
      <div className="detail-head">
        <Check
          on={false}
          accent={accent}
          onClick={async (e) => {
            await completeWithUndo(task, e.currentTarget);
            onGone();
          }}
          label={`Complete ${task.title}`}
        />
        <input
          className="detail-title grow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && updateTask(task.id, { title: title.trim() })}
          aria-label="Task title"
        />
      </div>

      <textarea
        rows={2}
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => updateTask(task.id, { notes: notes.trim() || null })}
      />

      <div className="row spread wrap" style={{ margin: 'var(--space-3) 0' }}>
        {task.gacha_points != null ? (
          <GachaWorth task={task} />
        ) : (
          <SizePicker value={task.size} onChange={(size) => updateTask(task.id, { size })} />
        )}
        <ColorPicker value={task.color ?? null} onChange={(color) => updateTask(task.id, { color })} />
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        {/* Reordering runs against the manual order, never against whatever the
            filters happen to be showing — otherwise "up" means something
            different depending on what you typed in the search box. */}
        <button
          className="icon-btn"
          disabled={!prev}
          onClick={() => moveRow('tasks', task, prev, true)}
          aria-label="Move up"
        >
          <Icon name="arrowUp" size={16} />
        </button>
        <button
          className="icon-btn"
          disabled={!next}
          onClick={() => moveRow('tasks', task, next, false)}
          aria-label="Move down"
        >
          <Icon name="arrowDown" size={16} />
        </button>
        <span className="muted small grow">
          {index + 1} of {siblings.length}
        </span>
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>

      <h3 className="section-heading">Steps</h3>
      <SubtaskList task={task} subs={subs} accent={accent} />
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
    <div
      className="sheet stack-sm"
      style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-2)' }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        rows={2}
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="row spread wrap">
        {task.gacha_points != null ? (
          <GachaWorth task={task} />
        ) : (
          <SizePicker value={size} onChange={setSize} />
        )}
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="row spread">
        <button
          className="btn danger"
          onClick={async () => {
            await deleteTask(task);
            close();
            showToast(`Deleted “${task.title}”`, { undo: () => restoreTask(task) });
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
