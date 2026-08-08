import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { logicalDay, daysBetween } from '../db/time.js';
import Card from '../components/Card.jsx';
import Check from '../components/Check.jsx';
import Gacha from '../components/Gacha.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';
import { completeWithUndo } from './Tasks.jsx';

/*
 * The Tasks dashboard (design.md §1): one card per sub-page, each showing
 * that page's real content. Two sub-pages, so this is the simple end of the
 * dashboard spectrum — a To Do preview you can act on, the gacha machine
 * (Oskar wants it on the section's home, and this is now the section's
 * home), and a quiet Done card.
 *
 * Completing here is the same take-back-able tap as Home and the list; the
 * one-level-down rule bans copying a PAGE two levels up, not acting on it
 * one level up.
 */
const LIST_LIMIT = 8;

export default function TasksDash() {
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-2)' }} />
        Tasks
      </h1>
      <div className="dash-grid">
        <div className="dash-col">
          <ToDoCard />
        </div>
        <div className="dash-col">
          <Gacha />
          <DoneCard />
        </div>
      </div>
    </>
  );
}

function ToDoCard() {
  const open = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );

  return (
    <Card title={`To Do · ${open.length}`} accent={2} to="/tasks/todo">
      {open.length === 0 && <p className="empty">All clear.</p>}
      <div className="stack-sm">
        {open.slice(0, LIST_LIMIT).map((t, i) => (
          <div className="row" key={t.id}>
            <Check
              on={false}
              accent={itemAccent(t, i)}
              onClick={(e) => completeWithUndo(t, e.currentTarget)}
              label={`Complete ${t.title}`}
            />
            <span className="grow">{t.title}</span>
          </div>
        ))}
        {open.length > LIST_LIMIT && (
          <p className="muted small">and {open.length - LIST_LIMIT} more</p>
        )}
      </div>
    </Card>
  );
}

/*
 * "What got finished today, or how long since anything did" — the card the
 * spec names for thin sub-pages. Quiet means small, not empty.
 */
function DoneCard() {
  const done = useLiveQuery(
    async () => {
      const rows = await db.tasks.filter((t) => !t.deleted && !!t.done_at).toArray();
      return rows.sort((a, b) => b.done_at - a.done_at);
    },
    [],
    []
  );

  const today = logicalDay();
  const doneToday = done.filter((t) => logicalDay(t.done_at) === today);
  const last = done[0];

  return (
    <Card title={doneToday.length ? `Done · ${doneToday.length} today` : 'Done'} accent={2} to="/tasks/done">
      {doneToday.length > 0 && (
        <div className="stack-sm">
          {doneToday.slice(0, 5).map((t) => (
            <div className="row muted" key={t.id}>
              <span className="grow">{t.title}</span>
            </div>
          ))}
        </div>
      )}
      {doneToday.length === 0 && last && (
        <p className="muted small">
          Nothing yet today — last finished {daysBetween(logicalDay(last.done_at), today)}d ago.
        </p>
      )}
      {doneToday.length === 0 && !last && <p className="empty">Nothing finished yet. It'll come.</p>}
    </Card>
  );
}
