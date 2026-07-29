import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { uncompleteTask, SIZE_POINTS } from '../db/actions.js';
import { logicalDay, prettyDay } from '../db/time.js';
import Check from '../components/Check.jsx';

export default function TasksDone() {
  const tasks = useLiveQuery(
    async () => {
      const rows = await db.tasks.filter((t) => !t.deleted && !!t.done_at).toArray();
      return rows.sort((a, b) => b.done_at - a.done_at).slice(0, 100);
    },
    [],
    []
  );

  // Group by the logical day they were completed.
  const groups = [];
  for (const t of tasks) {
    const day = logicalDay(t.done_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.tasks.push(t);
    else groups.push({ day, tasks: [t] });
  }

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-2)' }} />
        Done
      </h1>
      {groups.length === 0 && <p className="empty">Nothing finished yet. It'll come.</p>}
      {groups.map((g) => (
        <section key={g.day} style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="muted display" style={{ marginBottom: 'var(--space-2)' }}>
            {prettyDay(g.day)}
          </h2>
          {g.tasks.map((t) => (
            <div className="list-item done" key={t.id}>
              <Check on accent={2} onClick={() => uncompleteTask(t)} label={`Un-complete ${t.title}`} />
              <div className="grow">
                <div className="item-title">{t.title}</div>
              </div>
              <span className="size-chip">+{SIZE_POINTS[t.size]}</span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
