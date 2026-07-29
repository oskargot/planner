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

export default function Home() {
  return (
    <>
      <header className="row spread" style={{ marginBottom: 'var(--space-4)' }}>
        <h1 className="display" style={{ fontSize: 'var(--size-2xl)' }}>
          {APP_NAME}
        </h1>
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          ⚙︎
        </Link>
      </header>
      <div className="home-grid">
        <PointsCard />
        <HabitsCard />
        <TasksCard />
        <StudioCard />
        <HeatStripCard />
        <InventoryCard />
      </div>
    </>
  );
}

function PointsCard() {
  const balance = useBalance();
  const earned = useEarnedToday();
  const cheapest = useLiveQuery(
    async () => {
      const items = await db.shop_items
        .filter((i) => !i.deleted && !i.sold_out)
        .toArray();
      items.sort((a, b) => a.cost - b.cost);
      return items.find((i) => i.cost <= (balance ?? 0)) || null;
    },
    [balance],
    null
  );

  return (
    <Card title="Points" accent={5} to="/shop" linkLabel="shop →" sticker="✦">
      <div className="display bold" style={{ fontSize: 'var(--size-2xl)', color: 'var(--color-points)' }}>
        ✦ {balance ?? '…'}
      </div>
      <div className="muted">+{earned} earned today</div>
      {cheapest && (
        <div className="small secondary" style={{ marginTop: 'var(--space-2)' }}>
          You can afford <b>{cheapest.name}</b> (✦ {cheapest.cost})
        </div>
      )}
    </Card>
  );
}

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

  async function toggle(h, e) {
    if (doneIds.has(h.id)) await uncheckHabit(h.id, today);
    else {
      floatPoints(e.currentTarget, 1);
      await checkHabit(h.id, today);
      if (doneIds.size + 1 === habits.length && habits.length > 1) confettiBurst(e.currentTarget);
    }
  }

  return (
    <Card title="Habits today" accent={3} to="/habits">
      {habits.length === 0 && <p className="empty">No habits yet.</p>}
      <div className="stack-sm">
        {habits.map((h) => (
          <div className="row" key={h.id}>
            <Check
              on={doneIds.has(h.id)}
              accent={3}
              round
              onClick={(e) => toggle(h, e)}
              label={h.name}
            />
            <span>{h.emoji}</span>
            <span className={doneIds.has(h.id) ? 'muted' : ''}>{h.name}</span>
          </div>
        ))}
      </div>
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
    <Card title={`Tasks · ${open.length} open`} accent={2} to="/tasks">
      {open.length === 0 && <p className="empty">All clear.</p>}
      <div className="stack-sm">
        {open.slice(0, 4).map((t) => (
          <div className="row" key={t.id}>
            <Check
              on={false}
              accent={2}
              onClick={async (e) => {
                floatPoints(e.currentTarget, SIZE_POINTS[t.size]);
                await completeTask(t);
              }}
              label={`Complete ${t.title}`}
            />
            <span className="grow">{t.title}</span>
            <span className="size-chip">{t.size}</span>
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
    <Card title="Studio" accent={4} to="/studio">
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

function HeatStripCard() {
  const today = logicalDay();
  // Last 5 whole weeks, aligned Monday-first, ending today.
  const start = addDays(today, -34);
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const stats = useLiveQuery(() => habitDayStats(days), [today], null);

  return (
    <Card title="Heat" accent={6} to="/habits/month" linkLabel="month →">
      <div className="heat-strip">
        {days.map((d) => (
          <div
            key={d}
            className="heat-cell"
            title={d}
            style={{ background: heatVar(stats?.get(d)?.ratio ?? 0, stats?.get(d)?.done ?? 0) }}
          />
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
    <Card title="Inventory" accent={1} to="/shop/inventory" sticker="📦">
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
