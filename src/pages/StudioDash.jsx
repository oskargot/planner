import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { touchProject } from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import { staleness } from '../db/selectors.js';
import { floatPoints } from '../fx.js';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';

/*
 * The Studio dashboard (design.md §1). Two sub-pages, so it wants something
 * simple: the active projects with their staleness (touching from here is
 * the same one-tap act Home already allows), and a quiet Archived card.
 * Names link to the project itself — the card is also a door to the middle
 * of the section, not only to its lists.
 */
export default function StudioDash() {
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-4)' }} />
        Studio
      </h1>
      <div className="dash-grid">
        <div className="dash-col">
          <ActiveCard />
        </div>
        <div className="dash-col">
          <ArchivedCard />
        </div>
      </div>
    </>
  );
}

function ActiveCard() {
  const today = logicalDay();
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted && p.status === 'active').sortBy('sort_order'),
    [],
    []
  );
  const touches = useLiveQuery(() => db.project_touches.filter((t) => !t.deleted).toArray(), [], []);

  const rows = projects.map((p) => ({ p, stale: staleness(touches, p.id) }));

  return (
    <Card title={`Active · ${projects.length}`} accent={4} to="/studio/active">
      {projects.length === 0 && <p className="empty">No projects yet.</p>}
      <div className="stack-sm">
        {rows.map(({ p, stale }) => (
          <div className="row" key={p.id}>
            <Link to={`/studio/p/${p.id}`} className="grow">
              {p.name}
            </Link>
            <span className="muted small">
              {stale === 0 ? (
                <Icon name="sparkles" size={14} />
              ) : stale === null ? (
                'never'
              ) : (
                `${stale}d`
              )}
            </span>
            {stale !== 0 && (
              <button
                className="btn"
                onClick={(e) => {
                  floatPoints(e.currentTarget, 1);
                  touchProject(p.id, today);
                }}
              >
                touch
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ArchivedCard() {
  const archived = useLiveQuery(
    async () => {
      const rows = await db.projects
        .filter((p) => !p.deleted && p.status !== 'active')
        .sortBy('updated_at');
      return rows.reverse();
    },
    [],
    []
  );

  return (
    <Card title={archived.length ? `Archived · ${archived.length}` : 'Archived'} accent={4} to="/studio/archived">
      {archived.length === 0 && <p className="muted small">Nothing shelved.</p>}
      {archived.length > 0 && <p className="muted small">Most recent: {archived[0].name}</p>}
    </Card>
  );
}
