import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { updateProject } from '../db/actions.js';

export default function StudioArchived() {
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted && p.status !== 'active').sortBy('sort_order'),
    [],
    []
  );
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-4)' }} />
        Archived
      </h1>
      {projects.length === 0 && <p className="empty">Nothing paused or finished yet.</p>}
      {projects.map((p) => (
        <div className="list-item" key={p.id}>
          <Link to={`/studio/p/${p.id}`} className="grow">
            <span className="item-title">{p.name}</span>{' '}
            <span className={`badge ${p.status === 'done' ? 'success' : ''}`}>{p.status}</span>
          </Link>
          <button className="btn" onClick={() => updateProject(p.id, { status: 'active' })}>
            Reactivate
          </button>
        </div>
      ))}
    </>
  );
}
