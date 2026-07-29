import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addMilestone,
  toggleMilestone,
  updateMilestone,
  deleteMilestone,
  updateProject,
  deleteProject,
  touchProject,
  untouchProject,
} from '../db/actions.js';
import { logicalDay, addDays } from '../db/time.js';
import { floatPoints, confettiBurst } from '../fx.js';
import Check from '../components/Check.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import { StaleBadge } from './Studio.jsx';
import { staleness } from '../db/selectors.js';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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
    return <p className="empty">Project not found. <Link to="/studio">Back to Studio</Link></p>;
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
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: `var(--accent-${accent})` }} />
        {project.name}
        <span style={{ marginLeft: 'auto' }}>
          <StaleBadge stale={stale} touchedToday={touchedToday} />
        </span>
      </h1>

      <EditableDescription project={project} />

      <div className="row spread wrap" style={{ marginBottom: 'var(--space-3)' }}>
        <ColorPicker
          value={project.color ?? '4'}
          onChange={(c) => updateProject(id, { color: c ?? '4' })}
          allowAuto={false}
        />
      </div>

      <button className={`btn${touchedToday ? '' : ' primary'}`} onClick={toggleTouch}>
        {touchedToday ? '✓ Worked on it today' : 'Worked on it today?'}
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

      <h2 className="display" style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>
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
              🎉 Mark done
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => updateProject(id, { status: 'active' })}>
            Reactivate
          </button>
        )}
        <button
          className="btn danger"
          onClick={() => {
            if (confirm(`Delete "${project.name}"? Earned points stay.`)) {
              deleteProject(id).then(() => navigate('/studio'));
            }
          }}
        >
          Delete
        </button>
      </div>
    </>
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
  // Reorder by swapping into the gap before/after the neighbor (fractional sort_order).
  function move(dirPrev) {
    const other = dirPrev ? prev : next;
    if (!other) return;
    updateMilestone(m.id, { sort_order: other.sort_order + (dirPrev ? -0.5 : 0.5) });
  }

  return (
    <div className={`list-item${m.done_at ? ' done' : ''}`}>
      <Check on={!!m.done_at} accent={accent} onClick={() => toggleMilestone(m)} label={m.title} />
      <span className="item-title grow">{m.title}</span>
      <button className="icon-btn" onClick={() => move(true)} disabled={!prev} aria-label="Move up">↑</button>
      <button className="icon-btn" onClick={() => move(false)} disabled={!next} aria-label="Move down">↓</button>
      <button className="icon-btn" onClick={() => deleteMilestone(m.id)} aria-label="Delete milestone">✕</button>
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
