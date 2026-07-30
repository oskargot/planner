import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addProject, touchProject, untouchProject } from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import { staleness } from '../db/selectors.js';
import { floatPoints } from '../fx.js';
import ColorPicker from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';

export default function Studio() {
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted && p.status === 'active').sortBy('sort_order'),
    [],
    []
  );
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-4)' }} />
        Studio
      </h1>
      <AddProject />
      <div style={{ marginTop: 'var(--space-4)' }}>
        {projects.length === 0 && <p className="empty">No projects yet. What do you want to make?</p>}
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </>
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
    () => db.project_touches.where('day').equals(today).filter((t) => !t.deleted && t.project_id === project.id).toArray(),
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
