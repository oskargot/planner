import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addProject,
  updateProject,
  deleteProject,
  restoreProject,
  touchProject,
  untouchProject,
  addMilestone,
  toggleMilestone,
  updateMilestone,
  deleteMilestone,
  moveRow,
} from '../db/actions.js';
import { logicalDay, addDays } from '../db/time.js';
import { staleness } from '../db/selectors.js';
import { floatPoints, confettiBurst } from '../fx.js';
import { showToast } from '../toast.js';
import { useWide } from '../useMediaQuery.js';
import Check from '../components/Check.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';

/*
 * The Studio, both of its screens.
 *
 * `/studio` and `/studio/p/:id` are the same component. On a phone they're two
 * pages — list, then detail, with a back gesture between them. On a wide
 * screen they're one: the list on the left, the open project on the right, and
 * clicking a project changes the right half rather than replacing the page.
 *
 * Keeping them in one file is what makes that possible without a circular
 * import between a list module and a detail module, and it means the two
 * layouts can never drift apart in what they can do.
 */
export default function Studio() {
  const wide = useWide();
  const { id } = useParams();
  const navigate = useNavigate();

  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted && p.status === 'active').sortBy('sort_order'),
    [],
    []
  );

  // On a wide screen an open project is always shown next to the list; with
  // nothing chosen the pane invites you to choose. On a phone the detail IS
  // the page, so no selection means we're simply on the list.
  const selectedId = id ?? null;

  if (!wide && selectedId) {
    return <ProjectPanel id={selectedId} onGone={() => navigate('/studio')} standalone />;
  }

  const list = (
    <>
      <AddProject />
      <div style={{ marginTop: 'var(--space-4)' }}>
        {projects.length === 0 && (
          <p className="empty">No projects yet. What do you want to make?</p>
        )}
        {projects.map((p, i) =>
          wide ? (
            <ProjectRow
              key={p.id}
              project={p}
              index={i}
              siblings={projects}
              selected={p.id === selectedId}
              onSelect={() => navigate(`/studio/p/${p.id}`)}
            />
          ) : (
            <ProjectCard key={p.id} project={p} />
          )
        )}
      </div>
    </>
  );

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-4)' }} />
        Studio
      </h1>

      {wide ? (
        <div className="split">
          <div className="split-list">{list}</div>
          <div className="split-detail">
            {selectedId ? (
              <ProjectPanel
                key={selectedId}
                id={selectedId}
                onGone={() => navigate('/studio')}
              />
            ) : (
              <div className="split-empty">
                <Icon name="studio" size={26} />
                <p>Pick a project to see its milestones.</p>
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
 * The compact row the wide list uses. The phone keeps the full card: it's the
 * whole screen there, so it can afford the progress bar and the big touch
 * button. Beside a detail pane, all a row has to do is say which project it is
 * and whether it's been touched.
 */
function ProjectRow({ project, index, siblings, selected, onSelect }) {
  const today = logicalDay();
  const touches = useLiveQuery(
    () => db.project_touches.filter((t) => t.project_id === project.id && !t.deleted).toArray(),
    [project.id],
    []
  );
  const touchedToday = touches.some((t) => t.day === today);
  const stale = staleness(touches, project.id);
  const accent = project.color || 4;
  const prev = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <div
      className={`list-item${selected ? ' selected' : ''}`}
      style={{ borderLeft: `4px solid var(--accent-${accent})` }}
      onClick={onSelect}
    >
      <span className="grow item-title">{project.name}</span>
      <StaleBadge stale={stale} touchedToday={touchedToday} />
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
        <button
          className="icon-btn"
          disabled={!prev}
          onClick={() => moveRow('projects', project, prev, true)}
          aria-label="Move up"
        >
          <Icon name="arrowUp" size={15} />
        </button>
        <button
          className="icon-btn"
          disabled={!next}
          onClick={() => moveRow('projects', project, next, false)}
          aria-label="Move down"
        >
          <Icon name="arrowDown" size={15} />
        </button>
      </span>
    </div>
  );
}

export function ProjectCard({ project }) {
  const today = logicalDay();
  const milestones = useLiveQuery(
    () => db.milestones.where('project_id').equals(project.id).filter((m) => !m.deleted).toArray(),
    [project.id],
    []
  );
  const touches = useLiveQuery(
    () =>
      db.project_touches
        .where('day')
        .equals(today)
        .filter((t) => !t.deleted && t.project_id === project.id)
        .toArray(),
    [project.id, today],
    []
  );
  const allTouches = useLiveQuery(
    () => db.project_touches.filter((t) => t.project_id === project.id).toArray(),
    [project.id],
    []
  );

  const touchedToday = touches.length > 0;
  const done = milestones.filter((m) => m.done_at).length;
  const stale = staleness(allTouches, project.id);
  const accent = project.color || 4;

  async function toggleTouch(e) {
    if (touchedToday) {
      await untouchProject(project.id, today);
    } else {
      floatPoints(e.currentTarget, 1);
      await touchProject(project.id, today);
    }
  }

  return (
    <div className="card" style={{ borderLeft: `4px solid var(--accent-${accent})` }}>
      <div className="row spread">
        <Link to={`/studio/p/${project.id}`} className="grow">
          <div className="card-title">{project.name}</div>
        </Link>
        <StaleBadge stale={stale} touchedToday={touchedToday} />
      </div>
      {milestones.length > 0 && (
        <div className="row" style={{ margin: 'var(--space-2) 0' }}>
          <div className="progress grow" style={{ '--progress-accent': `var(--accent-${accent})` }}>
            <div style={{ width: `${milestones.length ? (done / milestones.length) * 100 : 0}%` }} />
          </div>
          <span className="muted">
            {done}/{milestones.length}
          </span>
        </div>
      )}
      <button
        className={`btn${touchedToday ? '' : ' primary'}`}
        style={{ marginTop: 'var(--space-2)' }}
        onClick={toggleTouch}
      >
        {touchedToday ? (
          <>
            <Icon name="check" size={15} strokeWidth={2.4} /> Worked on it today
          </>
        ) : (
          'Worked on it today?'
        )}
      </button>
    </div>
  );
}

export function StaleBadge({ stale, touchedToday }) {
  if (touchedToday || stale === 0) return <span className="badge success">today</span>;
  if (stale === null) return <span className="badge">never touched</span>;
  const cls = stale >= 7 ? 'danger' : stale >= 3 ? 'warn' : '';
  return <span className={`badge ${cls}`}>{stale}d ago</span>;
}

function AddProject() {
  const [name, setName] = useState('');
  const [color, setColor] = useState('4');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await addProject(name.trim(), color);
    setName('');
  }

  return (
    <form className="row wrap" onSubmit={submit}>
      <input
        className="grow"
        placeholder="New project…"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ColorPicker value={color} onChange={(c) => setColor(c ?? '4')} allowAuto={false} />
      <button className="btn primary" type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

/*
 * One project, in full. `standalone` is the phone's version — it draws its own
 * page title and a way back, because there it IS the page. In the pane it
 * skips both: the list beside it is the way back, and the section already has
 * a title at the top of the screen.
 */
export function ProjectPanel({ id, onGone, standalone = false }) {
  const today = logicalDay();
  const project = useLiveQuery(() => db.projects.get(id), [id]);
  const milestones = useLiveQuery(
    () => db.milestones.where('project_id').equals(id).filter((m) => !m.deleted).sortBy('sort_order'),
    [id],
    []
  );
  const touches = useLiveQuery(
    () => db.project_touches.filter((t) => t.project_id === id && !t.deleted).toArray(),
    [id],
    []
  );

  if (!project || project.deleted) {
    return (
      <p className="empty">
        Project not found. <Link to="/studio">Back to Studio</Link>
      </p>
    );
  }

  const touchDays = new Set(touches.map((t) => t.day));
  const touchedToday = touchDays.has(today);
  const accent = project.color || 4;
  const stale = staleness(touches, id);
  // last 14 logical days, oldest first
  const strip = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  async function toggleTouch(e) {
    if (touchedToday) await untouchProject(id, today);
    else {
      floatPoints(e.currentTarget, 1);
      await touchProject(id, today);
    }
  }

  async function markDone(e) {
    await updateProject(id, { status: 'done' });
    confettiBurst(e.currentTarget); // completed project → celebration (§8)
  }

  return (
    <div className="detail">
      {standalone ? (
        <h1 className="page-title">
          <span className="accent-dot" style={{ background: `var(--accent-${accent})` }} />
          {project.name}
          <span style={{ marginLeft: 'auto' }}>
            <StaleBadge stale={stale} touchedToday={touchedToday} />
          </span>
        </h1>
      ) : (
        <div className="detail-head">
          <span className="accent-dot" style={{ background: `var(--accent-${accent})` }} />
          <EditableName project={project} />
          <StaleBadge stale={stale} touchedToday={touchedToday} />
        </div>
      )}

      <EditableDescription project={project} />

      <div className="row spread wrap" style={{ marginBottom: 'var(--space-3)' }}>
        <ColorPicker
          value={project.color ?? '4'}
          onChange={(c) => updateProject(id, { color: c ?? '4' })}
          allowAuto={false}
        />
      </div>

      <button className={`btn${touchedToday ? '' : ' primary'}`} onClick={toggleTouch}>
        {touchedToday ? (
          <>
            <Icon name="check" size={15} strokeWidth={2.4} /> Worked on it today
          </>
        ) : (
          'Worked on it today?'
        )}
      </button>

      <div className="row" style={{ margin: 'var(--space-4) 0', gap: 3 }}>
        {strip.map((d) => (
          <div
            key={d}
            title={d}
            style={{
              flex: 1,
              height: 18,
              borderRadius: 'var(--radius-sm)',
              background: touchDays.has(d) ? `var(--accent-${accent})` : 'var(--bg-sunken)',
            }}
          />
        ))}
      </div>

      <h2 className="section-heading">
        Milestones <span className="muted small">structure, not points</span>
      </h2>
      <div>
        {milestones.map((m, i) => (
          <MilestoneRow
            key={m.id}
            m={m}
            prev={milestones[i - 1]}
            next={milestones[i + 1]}
            accent={accent}
          />
        ))}
      </div>
      <AddMilestone projectId={id} />

      <div className="row wrap" style={{ marginTop: 'var(--space-6)' }}>
        {project.status === 'active' ? (
          <>
            <button className="btn" onClick={() => updateProject(id, { status: 'paused' })}>
              Pause
            </button>
            <button className="btn" onClick={markDone}>
              <Icon name="trophy" size={16} /> Mark done
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => updateProject(id, { status: 'active' })}>
            Reactivate
          </button>
        )}
        <button
          className="btn danger"
          onClick={async () => {
            await deleteProject(id);
            onGone?.();
            showToast(`Deleted “${project.name}” — earned points stay`, {
              undo: () => restoreProject(id),
            });
          }}
        >
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>
    </div>
  );
}

function EditableName({ project }) {
  const [name, setName] = useState(project.name);
  return (
    <input
      className="detail-title grow"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => name.trim() && updateProject(project.id, { name: name.trim() })}
      aria-label="Project name"
    />
  );
}

function EditableDescription({ project }) {
  const [text, setText] = useState(project.description || '');
  return (
    <textarea
      rows={2}
      placeholder="What is this?"
      style={{ width: '100%', marginBottom: 'var(--space-3)' }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = text.trim() || null;
        if (v !== project.description) updateProject(project.id, { description: v });
      }}
    />
  );
}

function MilestoneRow({ m, prev, next, accent }) {
  return (
    <div className={`list-item${m.done_at ? ' done' : ''}`}>
      <Check on={!!m.done_at} accent={accent} onClick={() => toggleMilestone(m)} label={m.title} />
      <span className="item-title grow">{m.title}</span>
      <button
        className="icon-btn"
        onClick={() => moveRow('milestones', m, prev, true)}
        disabled={!prev}
        aria-label="Move up"
      >
        <Icon name="arrowUp" size={16} />
      </button>
      <button
        className="icon-btn"
        onClick={() => moveRow('milestones', m, next, false)}
        disabled={!next}
        aria-label="Move down"
      >
        <Icon name="arrowDown" size={16} />
      </button>
      <button
        className="icon-btn"
        onClick={() => deleteMilestone(m.id)}
        aria-label="Delete milestone"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function AddMilestone({ projectId }) {
  const [title, setTitle] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await addMilestone(projectId, title.trim());
    setTitle('');
  }
  return (
    <form className="row" style={{ marginTop: 'var(--space-2)' }} onSubmit={submit}>
      <input
        className="grow"
        placeholder="Add a milestone…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button className="btn" type="submit" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}
