import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { checkHabit, uncheckHabit, checkChore, SIZE_POINTS } from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import { useChores, choreStatus } from '../db/selectors.js';
import { floatPoints, confettiBurst } from '../fx.js';
import Card from '../components/Card.jsx';
import Check from '../components/Check.jsx';
import MiniMonth from '../components/MiniMonth.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';

/*
 * The Habits dashboard (design.md §1). Four sub-pages, and exactly the uneven
 * shape the spec predicted: one tall live card (Today, checkable — ticking a
 * habit is inside the interaction budget) and three quiet ones. Month is the
 * heat grid itself, which is already a picture; Chores says what's ready or
 * when something next will be; Archived is a count and a name.
 */
export default function HabitsDash() {
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Habits
      </h1>
      <div className="dash-grid">
        <div className="dash-col">
          <TodayCard />
        </div>
        <div className="dash-col">
          <MonthCard />
          <ChoresCard />
          <ArchivedCard />
        </div>
      </div>
    </>
  );
}

function TodayCard() {
  const today = logicalDay();
  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deleted && !!h.active).sortBy('sort_order'),
    [],
    []
  );
  const entries = useLiveQuery(
    () => db.habit_entries.where('day').equals(today).filter((e) => !e.deleted).toArray(),
    [today],
    []
  );
  const doneIds = new Set(entries.map((e) => e.habit_id));

  async function toggle(h, e) {
    if (doneIds.has(h.id)) await uncheckHabit(h.id, today);
    else {
      floatPoints(e.currentTarget, 1);
      await checkHabit(h.id, today);
      if (doneIds.size + 1 === habits.length && habits.length > 1) confettiBurst(e.currentTarget);
    }
  }

  return (
    <Card title={`Today · ${doneIds.size}/${habits.length}`} accent={3} to="/habits/today">
      {habits.length === 0 && <p className="empty">No habits yet.</p>}
      <div className="habit-minis">
        {habits.map((h, i) => (
          <div className="habit-mini" key={h.id}>
            <Check
              on={doneIds.has(h.id)}
              accent={itemAccent(h, i)}
              round
              onClick={(e) => toggle(h, e)}
              label={h.name}
            />
            {h.emoji && <span className="habit-mini-emoji">{h.emoji}</span>}
            <span className={`habit-mini-name${doneIds.has(h.id) ? ' muted' : ''}`}>{h.name}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthCard() {
  return (
    <Card title="Month" accent={3} to="/habits/month">
      <MiniMonth />
    </Card>
  );
}

function ChoresCard() {
  const today = logicalDay();
  const { chores, lastDone } = useChores();
  const withStatus = chores.map((c) => ({ c, status: choreStatus(c, lastDone.get(c.id), today) }));
  const ready = withStatus.filter(({ status }) => status.state === 'ready');
  const resting = withStatus
    .filter(({ status }) => status.state === 'resting')
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft);

  async function complete(chore, e) {
    floatPoints(e.currentTarget, SIZE_POINTS[chore.size] ?? 0);
    await checkChore(chore, today);
  }

  return (
    <Card title={ready.length ? `Chores · ${ready.length} ready` : 'Chores'} accent={3} to="/habits/chores">
      {chores.length === 0 && <p className="empty">No chores yet.</p>}
      {ready.length > 0 && (
        <div className="stack-sm">
          {ready.map(({ c }) => (
            <div className="row" key={c.id}>
              <span style={{ display: 'inline-flex' }}>
                <Check
                  on={false}
                  accent={itemAccent(c, chores.indexOf(c))}
                  round
                  onClick={(e) => complete(c, e)}
                  label={c.name}
                />
              </span>
              {c.emoji && <span>{c.emoji}</span>}
              <span className="grow">{c.name}</span>
            </div>
          ))}
        </div>
      )}
      {chores.length > 0 && ready.length === 0 && (
        <p className="muted small">
          {resting.length
            ? `All resting — next ready in ${resting[0].status.daysLeft}d.`
            : 'All done today.'}
        </p>
      )}
    </Card>
  );
}

function ArchivedCard() {
  const archived = useLiveQuery(
    async () => {
      const rows = await db.habits.filter((h) => !h.deleted && !h.active).sortBy('updated_at');
      return rows.reverse();
    },
    [],
    []
  );

  return (
    <Card title={archived.length ? `Archived · ${archived.length}` : 'Archived'} accent={3} to="/habits/archived">
      {archived.length === 0 && <p className="muted small">Nothing retired.</p>}
      {archived.length > 0 && (
        <p className="muted small">
          Most recent: {archived[0].emoji ? `${archived[0].emoji} ` : ''}
          {archived[0].name}
        </p>
      )}
    </Card>
  );
}
