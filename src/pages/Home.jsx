import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { checkHabit, uncheckHabit, touchProject, checkChore, SIZE_POINTS } from '../db/actions.js';
import { logicalDay, parseDay, monthLabel } from '../db/time.js';
import {
  useBalance,
  useEarnedToday,
  useGreetingState,
  habitDayStats,
  heatVar,
  staleness,
  useChores,
  choreStatus,
} from '../db/selectors.js';
import { greeting, flavorLine } from '../greeting.js';
import { barrelState, barrelsBySlot, remainingMs, formatRemaining } from '../db/tumbler.js';
import { useTumbler } from './Tumbler.jsx';
import { floatPoints, confettiBurst } from '../fx.js';
import { APP_NAME } from '../config.js';
import Card from '../components/Card.jsx';
import Check from '../components/Check.jsx';
import Icon from '../components/Icon.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';
import { completeWithUndo } from './Tasks.jsx';

// Tasks heads a full-height column on wide screens, so a five-row preview left
// most of it empty. Still a preview — the card links to the whole list.
const LIST_LIMIT = 8;

export default function Home() {
  const balance = useBalance();
  const earned = useEarnedToday();

  return (
    <>
      <header className="row spread home-header">
        <h1 className="display wordmark">{APP_NAME}</h1>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          {/* Stats rather than the ledger: tapping the number is nearly always
              "how am I doing", not "what was that one transaction". */}
          <Link to="/settings/stats" className="header-points" aria-label="Points">
            <div className="balance">
              <Icon name="spark" size={18} /> {balance ?? '…'}
            </div>
            <div className="muted small">+{earned} today</div>
          </Link>
          <Link to="/settings" className="settings-btn" aria-label="Settings">
            <Icon name="gear" size={24} />
          </Link>
        </div>
      </header>
      <Greeting />
      {/* DOM order is the phone's: one full-width card each, habits → tasks
          → studio → rocks. The wide layout re-columns them in CSS rather than
          reordering here, so the narrow reading order stays intact. */}
      <div className="home-grid">
        <HabitsCard />
        <TasksCard />
        <ChoresCard />
        <StudioCard />
        <TumblerCard />
        <InventoryCard />
      </div>
    </>
  );
}

/*
 * "Good morning, Oskar" plus one line about the state of things. The clock is
 * held in state and ticked every minute, so the app doesn't sit open all
 * evening still saying good afternoon — and so the tumbler line appears the
 * moment a barrel finishes rather than on the next navigation.
 */
function Greeting() {
  const state = useGreetingState();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const line = state ? flavorLine(state, now) : null;

  return (
    <div className="greeting">
      <div className="greeting-hello">{greeting(now)}</div>
      {/* Reserves its own line whether or not there's anything to say, so the
          cards below don't jump when the flavor line appears or drops out. */}
      <div className="greeting-line">{line}</div>
    </div>
  );
}

// "Habits extended": the month calendar sits left with today's checkable rows
// beside it, so the card reads as one glance-and-tap unit. It splits at every
// width now — it used to stack above 700px, when Habits was one of three
// columns and simply had nowhere to put the list.
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

  const d = parseDay(today);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
  });
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
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
    <Card title="Habits" accent={3} to="/habits" className="card-habits">
      <div className="habits-split">
        <Link to="/habits/month" className="mini-month" aria-label="Open month view">
          <div className="month-label">{monthLabel(year, month)}</div>
          <div className="heat-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
              <div key={`w${i}`} className="heat-weekday">
                {w}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`pad${i}`} className="heat-cell outside" />
            ))}
            {days.map((day) => {
              const future = day > today;
              const cls = `heat-cell${future ? ' future' : ''}${day === today ? ' today' : ''}`;
              return (
                <div
                  key={day}
                  className={cls}
                  title={day}
                  style={{
                    background: future
                      ? undefined
                      : heatVar(stats?.get(day)?.ratio ?? 0, stats?.get(day)?.done ?? 0),
                  }}
                >
                  {Number(day.slice(-2))}
                </div>
              );
            })}
          </div>
        </Link>
        <div className="habit-minis">
          {habits.length === 0 && <p className="empty">No habits yet.</p>}
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
              <span className={`habit-mini-name${doneIds.has(h.id) ? ' muted' : ''}`}>
                {h.name}
              </span>
            </div>
          ))}
        </div>
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
    <Card title={`Tasks · ${open.length}`} accent={2} to="/tasks" className="card-tasks">
      {open.length === 0 && <p className="empty">All clear.</p>}
      <div className="stack-sm">
        {/* No size chip here either — see the note on the task row. The
            dashboard is for what's left to do, not for what it pays. */}
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
    <Card title="Studio" accent={4} to="/studio" className="card-studio">
      {projects.length === 0 && <p className="empty">No projects yet.</p>}
      {projects.length > 0 && rows.length === 0 && (
        <p className="empty">
          <Icon name="sparkles" size={16} /> Everything touched today.
        </p>
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

/*
 * The barrels at a glance. This is the card most likely to be the reason the
 * app got opened at all, so it says what's happening in each barrel and
 * nothing else — the actual game is one tap away.
 */
function TumblerCard() {
  const { barrelCount, barrels } = useTumbler();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const bySlot = barrelsBySlot(barrels, now);
  const slots = Array.from({ length: barrelCount }, (_, i) => i);
  const ready = slots.filter((s) => barrelState(bySlot.get(s), now) === 'ready').length;

  return (
    <Card title={ready > 0 ? `Rocks · ${ready} ready` : 'Rocks'} accent={6} to="/tumbler" className="card-tumbler">
      <div className="stack-sm">
        {slots.map((slot) => {
          const barrel = bySlot.get(slot);
          const state = barrelState(barrel, now);
          return (
            <div className="row" key={slot}>
              <Icon name="barrel" size={18} />
              <span className="grow">
                {state === 'ready' && 'Finished'}
                {state === 'running' && formatRemaining(remainingMs(barrel, now))}
                {state === 'idle' && <span className="muted">Empty</span>}
              </span>
              {state === 'ready' && <span className="badge success">open</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/*
 * Chores, only when something is ready. Like the inventory card it earns its
 * row by having news — a list of resting cooldowns is not news, so a quiet
 * day costs Home nothing.
 */
function ChoresCard() {
  const today = logicalDay();
  const { chores, lastDone } = useChores();
  const ready = chores.filter(
    (c) => choreStatus(c, lastDone.get(c.id), today).state === 'ready'
  );
  if (ready.length === 0) return null;

  async function complete(chore, e) {
    floatPoints(e.currentTarget, SIZE_POINTS[chore.size] ?? 0);
    await checkChore(chore, today);
  }

  return (
    <Card title={`Chores · ${ready.length} ready`} accent={6} to="/chores" className="card-chores">
      <div className="stack-sm">
        {ready.map((c, i) => (
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
    <Card title="Inventory" accent={1} to="/shop/inventory" className="card-inventory">
      <div className="stack-sm">
        {unredeemed.map((p) => (
          <div className="row" key={p.id}>
            <Icon name="box" size={18} />
            <span className="grow">{p.name_snapshot}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
