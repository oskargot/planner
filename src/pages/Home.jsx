import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { checkHabit, uncheckHabit, touchProject, checkChore, SIZE_POINTS } from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import {
  useBalance,
  useEarnedToday,
  useGreetingState,
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
import MiniMonth from '../components/MiniMonth.jsx';
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
      {/* Five cards, one per section (design.md §1): Chores folded into the
          Habits digest and Inventory into the Shop one, because a Home card
          for something one level below a section breaks the one-level-down
          rule. DOM order is the phone's — one full-width card each, habits →
          tasks → studio → rocks → shop. The wide layout re-columns them in
          CSS rather than reordering here, so the narrow reading order stays
          intact. */}
      <div className="home-grid">
        <HabitsCard />
        <TasksCard />
        <StudioCard />
        <TumblerCard />
        <ShopCard />
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

/*
 * The Habits section digest: the month calendar sits left with today's
 * checkable rows beside it, so the card reads as one glance-and-tap unit —
 * and any chore that's come ready joins the rows, because chores are a
 * sub-page of Habits and a Home card summarises the SECTION (design.md §1's
 * one-level-down rule; the separate Chores card broke it).
 */
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

  const { chores, lastDone } = useChores();
  const readyChores = chores.filter(
    (c) => choreStatus(c, lastDone.get(c.id), today).state === 'ready'
  );

  async function toggle(h, e) {
    if (doneIds.has(h.id)) await uncheckHabit(h.id, today);
    else {
      floatPoints(e.currentTarget, 1);
      await checkHabit(h.id, today);
      if (doneIds.size + 1 === habits.length && habits.length > 1) confettiBurst(e.currentTarget);
    }
  }

  async function completeChore(chore, e) {
    floatPoints(e.currentTarget, SIZE_POINTS[chore.size] ?? 0);
    await checkChore(chore, today);
  }

  return (
    <Card title="Habits" accent={3} to="/habits" className="card-habits">
      <div className="habits-split">
        <MiniMonth />
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
          {/* Only when something is ready — a list of resting cooldowns is
              not news, so a quiet day costs the card nothing. */}
          {readyChores.length > 0 && (
            <>
              <Link to="/habits/chores" className="home-chore-label muted small">
                chores ready
              </Link>
              {readyChores.map((c) => (
                <div className="habit-mini" key={c.id}>
                  <Check
                    on={false}
                    accent={itemAccent(c, chores.indexOf(c))}
                    round
                    onClick={(e) => completeChore(c, e)}
                    label={c.name}
                  />
                  {c.emoji && <span className="habit-mini-emoji">{c.emoji}</span>}
                  <span className="habit-mini-name">{c.name}</span>
                </div>
              ))}
            </>
          )}
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
 * The Shop section digest: what's within reach of the balance, and anything
 * bought but not yet collected. Replaces the old Inventory card — a Home
 * card for a sub-page broke the one-level-down rule, and "N within reach" is
 * the section-level fact the old card never said.
 */
function ShopCard() {
  const balance = useBalance();
  const items = useLiveQuery(
    () => db.shop_items.filter((i) => !i.deleted && !i.sold_out).toArray(),
    [],
    []
  );
  const unredeemed = useLiveQuery(
    () => db.purchases.filter((p) => !p.deleted && !p.redeemed_at).toArray(),
    [],
    []
  );
  const affordable = balance == null ? 0 : items.filter((i) => i.cost <= balance).length;

  return (
    <Card title="Shop" accent={5} to="/shop" className="card-shop">
      {items.length > 0 && (
        <p className="muted small">
          {affordable
            ? `${affordable} of ${items.length} within reach.`
            : 'Nothing within reach yet — keep earning.'}
        </p>
      )}
      {items.length === 0 && unredeemed.length === 0 && (
        <p className="empty">The shelves are bare.</p>
      )}
      {unredeemed.length > 0 && (
        <div className="stack-sm" style={{ marginTop: 'var(--space-2)' }}>
          {unredeemed.map((p) => (
            <div className="row" key={p.id}>
              <Icon name="box" size={18} />
              <span className="grow">{p.name_snapshot}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
