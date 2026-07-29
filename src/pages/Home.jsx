import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  completeTask,
  checkHabit,
  uncheckHabit,
  touchProject,
  SIZE_POINTS,
} from '../db/actions.js';
import { logicalDay, addDays } from '../db/time.js';
import { useBalance, useEarnedToday, habitDayStats, heatVar, staleness } from '../db/selectors.js';
import { floatPoints, confettiBurst } from '../fx.js';
import { APP_NAME } from '../config.js';
import Card from '../components/Card.jsx';
import Check from '../components/Check.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';
import { SizeChip } from './Tasks.jsx';

export default function Home() {
  const balance = useBalance();
  const earned = useEarnedToday();

  return (
    <>
      <header className="row spread home-header">
        <h1 className="display" style={{ fontSize: 'var(--size-2xl)' }}>
          {APP_NAME}
        </h1>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <Link to="/shop/ledger" className="header-points" aria-label="Points">
            <div className="balance">✦ {balance ?? '…'}</div>
            <div className="muted small">+{earned} today</div>
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            ⚙︎
          </Link>
        </div>
      </header>
      <div className="home-grid">
        <HabitsCard />
        <TasksCard />
        <StudioCard />
        <InventoryCard />
      </div>
    </>
  );
}

// "Habits extended": today's checkable rows plus the compressed heat strip.
function HabitsCard() {
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

  // Last 5 whole weeks, ending today.
  const start = addDays(today, -34);
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const stats = useLiveQuery(() => habitDayStats(days), [today], null);

  async function toggle(h, e) {
    if (doneIds.has(h.id)) await uncheckHabit(h.id, today);
    else {
      floatPoints(e.currentTarget, 1);
      await checkHabit(h.id, today);
      if (doneIds.size + 1 === habits.length && habits.length > 1) confettiBurst(e.currentTarget);
    }
  }

  return (
    <Card title="Habits" accent={3} to="/habits">
      {habits.length === 0 && <p className="empty">No habits yet.</p>}
      <div className="stack-sm">
        {habits.map((h, i) => (
          <div className="row" key={h.id}>
            <Check
              on={doneIds.has(h.id)}
              accent={itemAccent(h, i)}
              round
              onClick={(e) => toggle(h, e)}
              label={h.name}
            />
            <span>{h.emoji}</span>
            <span className={doneIds.has(h.id) ? 'muted' : ''}>{h.name}</span>
          </div>
        ))}
      </div>
      <Link
        to="/habits/month"
        className="heat-strip"
        aria-label="Open month view"
        style={{ marginTop: 'var(--space-3)' }}
      >
        {days.map((d) => (
          <div
            key={d}
            className="heat-cell"
            title={d}
            style={{ background: heatVar(stats?.get(d)?.ratio ?? 0, stats?.get(d)?.done ?? 0) }}
          />
        ))}
      </Link>
    </Card>
  );
}

function TasksCard() {
  const open = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );

  return (
    <Card title={`Tasks · ${open.length}`} accent={2} to="/tasks">
      {open.length === 0 && <p className="empty">All clear.</p>}
      <div className="stack-sm">
        {open.slice(0, 5).map((t, i) => (
          <div className="row" key={t.id}>
            <Check
              on={false}
              accent={itemAccent(t, i)}
              onClick={async (e) => {
                floatPoints(e.currentTarget, SIZE_POINTS[t.size]);
                await completeTask(t);
              }}
              label={`Complete ${t.title}`}
            />
            <span className="grow">{t.title}</span>
            <SizeChip size={t.size} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function StudioCard() {
  const today = logicalDay();
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted && p.status === 'active').sortBy('sort_order'),
    [],
    []
  );
  const touches = useLiveQuery(() => db.project_touches.filter((t) => !t.deleted).toArray(), [], []);

  const rows = projects
    .map((p) => ({ p, stale: staleness(touches, p.id) }))
    .filter(({ stale }) => stale !== 0)
    .sort((a, b) => (b.stale ?? 999) - (a.stale ?? 999))
    .slice(0, 4);

  return (
    <Card title="Studio" accent={4} to="/studio" className="wide">
      {projects.length === 0 && <p className="empty">No projects yet.</p>}
      {projects.length > 0 && rows.length === 0 && (
        <p className="empty">Everything touched today. 🌟</p>
      )}
      <div className="stack-sm">
        {rows.map(({ p, stale }) => (
          <div className="row" key={p.id}>
            <Link to={`/studio/p/${p.id}`} className="grow">
              {p.name}
            </Link>
            <span className="muted small">{stale === null ? 'never' : `${stale}d`}</span>
            <button
              className="btn"
              onClick={(e) => {
                floatPoints(e.currentTarget, 1);
                touchProject(p.id, today);
              }}
            >
              touch
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InventoryCard() {
  const unredeemed = useLiveQuery(
    () => db.purchases.filter((p) => !p.deleted && !p.redeemed_at).toArray(),
    [],
    []
  );
  if (unredeemed.length === 0) return null;
  return (
    <Card title="Inventory" accent={1} to="/shop/inventory" sticker="📦" className="wide">
      <div className="stack-sm">
        {unredeemed.map((p) => (
          <div className="row" key={p.id}>
            <span>📦</span>
            <span className="grow">{p.name_snapshot}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
