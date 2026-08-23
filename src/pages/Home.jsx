import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addTask,
  checkHabit,
  uncheckHabit,
  touchProject,
  checkChore,
  SIZE_POINTS,
} from '../db/actions.js';
import { logicalDay } from '../db/time.js';
import {
  useBalance,
  useEarnedToday,
  useGreetingState,
  useHabitStreaks,
  staleness,
  useChores,
  choreStatus,
} from '../db/selectors.js';
import { greeting, flavorLine } from '../greeting.js';
import { barrelState, barrelsBySlot, remainingMs, formatRemaining } from '../db/tumbler.js';
import { useTumbler } from './Tumbler.jsx';
import { floatPoints, confettiBurst } from '../fx.js';
import { APP_NAME } from '../config.js';
import { useWide } from '../useMediaQuery.js';
import Card from '../components/Card.jsx';
import Check from '../components/Check.jsx';
import MiniMonth from '../components/MiniMonth.jsx';
import Icon from '../components/Icon.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';
import { completeWithUndo } from './Tasks.jsx';

// Tasks heads a full-height column on wide screens, so a five-row preview left
// most of it empty. Still a preview — the card links to the whole list.
const LIST_LIMIT = 8;

// The wall's panels are fixed boxes, so each one's list is capped at what its
// box can hold and the rest is a scroll inside the panel rather than a page
// that grows. One number per panel, because the panels aren't the same height.
const WALL_LIMITS = { tasks: 9, studio: 4, shop: 4 };

/*
 * Home has two shapes.
 *
 * The phone's is five cards in a column, one per section (design.md §1). The
 * wide one is "the wall": three columns of panels sized to their content,
 * filling an 11" iPad in landscape with no scroll and no header — the rail
 * already carries the balance and the settings gear, and repeating either is
 * the duplication design.md §2 argues against.
 *
 * The branch is in JS rather than CSS because the two really are different
 * trees: the wall's panels are a different object from a card (no rainbow
 * stripe, no accent dot, a tinted header band instead), and the phone's
 * header block doesn't exist up there at all. What is NOT duplicated is the
 * reading: every section's data comes from one hook shared by both layouts,
 * so a card and its panel can never disagree about what's on the list.
 */
export default function Home() {
  const wide = useWide();
  return wide ? <HomeWall /> : <HomeColumn />;
}

function HomeColumn() {
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
 * The wall. Three columns whose widths follow their real content rather than a
 * rhythm: Habits needs the month calendar beside its rows, Tasks needs a
 * title's worth of line length, and the right column holds three short
 * digests. The grid takes the height that's left, so nothing scrolls but the
 * inside of a panel.
 */
function HomeWall() {
  return (
    <div className="home-wall">
      <GreetingRow />
      <div className="wall-grid">
        <HabitsPanel />
        <TasksPanel />
        <div className="wall-col">
          <RocksPanel />
          <StudioPanel />
          <ShopPanel />
        </div>
      </div>
    </div>
  );
}

/* ---------- greeting ---------- */

/*
 * "Good morning, Oskar" plus one line about the state of things. The clock is
 * held in state and ticked every minute, so the app doesn't sit open all
 * evening still saying good afternoon — and so the tumbler line appears the
 * moment a barrel finishes rather than on the next navigation.
 */
function useGreeting() {
  const state = useGreetingState();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return { hello: greeting(now), line: state ? flavorLine(state, now) : null };
}

function Greeting() {
  const { hello, line } = useGreeting();
  return (
    <div className="greeting">
      <div className="greeting-hello">{hello}</div>
      {/* Reserves its own line whether or not there's anything to say, so the
          cards below don't jump when the flavor line appears or drops out. */}
      <div className="greeting-line">{line}</div>
    </div>
  );
}

/*
 * The wall's version: one line instead of two, with the day's earnings where
 * the header's balance used to be. The reserved height moves to the ROW —
 * on one line, a min-height on the flavor line alone would reserve nothing,
 * because the hello beside it is already taller.
 */
function GreetingRow() {
  const { hello, line } = useGreeting();
  const earned = useEarnedToday();
  return (
    <div className="greeting-row">
      <span className="greeting-hello">{hello}</span>
      <span className="greeting-line">{line}</span>
      <span className="grow" />
      <span className="muted small">+{earned} today</span>
    </div>
  );
}

/* ---------- the panel ---------- */

/*
 * A panel is not a card. A card carries the rainbow top stripe, the accent dot
 * and the fading header rule; three of those side by side at this size was
 * more furniture than content. The section tint in the header band is a
 * panel's whole identity — kept to the band rather than the body, so no text's
 * contrast depends on it.
 *
 * The header is the door into the section, the way a card's "open" link is.
 */
function Panel({ title, accent, to, fact, factBadge = false, className = '', children }) {
  const vars = {
    '--panel-soft': `var(--accent-${accent}-soft)`,
    '--panel-ink': `var(--accent-${accent}-ink)`,
  };
  return (
    <section className={`panel${className ? ` ${className}` : ''}`} style={vars}>
      <Link className="panel-head" to={to}>
        <h2 className="panel-title">{title}</h2>
        {fact != null && (
          <span className={factBadge ? 'badge success' : 'panel-fact'}>{fact}</span>
        )}
      </Link>
      <div className="panel-body">{children}</div>
    </section>
  );
}

// A wall row's stripe and its done-fill, from one accent index.
function rowVars(accent) {
  return {
    '--row-accent': `var(--accent-${accent})`,
    '--row-soft': `var(--accent-${accent}-soft)`,
  };
}

/* ---------- habits ---------- */

/*
 * Today's habits, plus any chore that's come ready — chores are a sub-page of
 * Habits, and a Home summary is of the SECTION (design.md §1's one-level-down
 * rule; the separate Chores card broke it).
 */
function useHomeHabits() {
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

  return { today, habits, doneIds, chores, readyChores, toggle, completeChore };
}

function HabitsCard() {
  const { habits, doneIds, chores, readyChores, toggle, completeChore } = useHomeHabits();

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

function HabitsPanel() {
  const { habits, doneIds, chores, readyChores, toggle, completeChore } = useHomeHabits();
  const streaks = useHabitStreaks();

  return (
    <Panel
      title="Habits"
      accent={3}
      to="/habits"
      fact={habits.length > 0 ? `${doneIds.size} of ${habits.length} today` : null}
      className="panel-habits"
    >
      <MiniMonth inlineLink />
      <div className="wall-rows scrolls">
        {habits.length === 0 && <p className="empty">No habits yet.</p>}
        {habits.map((h, i) => {
          const done = doneIds.has(h.id);
          const streak = streaks?.get(h.id)?.streak ?? 0;
          return (
            <div
              className={`wall-row${done ? ' done' : ''}`}
              key={h.id}
              style={rowVars(itemAccent(h, i))}
            >
              <Check on={done} accent={itemAccent(h, i)} round onClick={(e) => toggle(h, e)} label={h.name} />
              {h.emoji && <span className="wall-emoji">{h.emoji}</span>}
              <span className="wall-name">{h.name}</span>
              {/* The row's own streak, not the greeting's all-habits one. */}
              {streak > 1 && (
                <span className="streak" title={`${streak} days in a row`}>
                  <Icon name="sparkles" size={12} /> {streak}
                </span>
              )}
            </div>
          );
        })}
        {readyChores.length > 0 && (
          <>
            <Link to="/habits/chores" className="wall-divider">
              chores ready
            </Link>
            {readyChores.map((c) => (
              <div
                className="wall-row"
                key={c.id}
                style={rowVars(itemAccent(c, chores.indexOf(c)))}
              >
                <Check
                  on={false}
                  accent={itemAccent(c, chores.indexOf(c))}
                  round
                  onClick={(e) => completeChore(c, e)}
                  label={c.name}
                />
                {c.emoji && <span className="wall-emoji">{c.emoji}</span>}
                <span className="wall-name">{c.name}</span>
                <span className="wall-pay">+{SIZE_POINTS[c.size] ?? 0}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

/* ---------- tasks ---------- */

function useOpenTasks() {
  return useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted && !t.done_at).sortBy('sort_order'),
    [],
    []
  );
}

function TasksCard() {
  const open = useOpenTasks();

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

function TasksPanel() {
  const open = useOpenTasks();

  return (
    <Panel
      title="Tasks"
      accent={2}
      to="/tasks"
      fact={`${open.length} open`}
      className="panel-tasks"
    >
      <div className="wall-rows scrolls">
        {open.length === 0 && <p className="empty">All clear.</p>}
        {open.slice(0, WALL_LIMITS.tasks).map((t, i) => (
          <div
            className="wall-row"
            key={t.id}
            style={rowVars(itemAccent(t, i))}
          >
            <Check
              on={false}
              accent={itemAccent(t, i)}
              onClick={(e) => completeWithUndo(t, e.currentTarget)}
              label={`Complete ${t.title}`}
            />
            <span className="wall-name">{t.title}</span>
            {/* The one place a size shows on a row. This panel is the working
                list rather than a preview of one, and which of two jobs to
                pick next is partly how big they are — but it's the bare
                letter, not the chip, because the size is still something you
                set once and then stop looking at. */}
            <span className="wall-size">{t.size}</span>
          </div>
        ))}
      </div>
      <AddTaskPill />
    </Panel>
  );
}

/*
 * The only genuinely new capability on Home. Everything else on the wall was
 * already reachable from a card; this puts the add box on the landing screen,
 * which is where `n` now goes when you're on it (see useShortcuts in App.jsx).
 *
 * Size isn't picked here on purpose: the pill is for getting a thought out of
 * your head before it evaporates, and a picker in front of that is a question
 * you didn't want asked. It lands as a Medium and the editor moves it.
 */
function AddTaskPill() {
  const [title, setTitle] = useState('');
  const ref = useRef(null);

  async function submit(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    await addTask(trimmed, 'M');
    setTitle('');
  }

  return (
    <form className="wall-add" onSubmit={submit}>
      <div className="add-pill">
        <Icon name="plus" size={16} />
        <input
          ref={ref}
          data-home-add
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New task"
        />
        {/* Only drawn where a keyboard is likely — a finger-only session gets
            no keycaps. CSS decides that, not a setting: (hover: hover) and
            (pointer: fine) is true of a trackpad keyboard case and false of a
            bare iPad. */}
        <kbd className="keycap">N</kbd>
      </div>
    </form>
  );
}

/* ---------- studio ---------- */

function useStaleProjects(limit) {
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
    .slice(0, limit);

  return { projects, rows };
}

function touch(p, e) {
  floatPoints(e.currentTarget, 1);
  touchProject(p.id, logicalDay());
}

function StudioCard() {
  const { projects, rows } = useStaleProjects(4);

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
            <button className="btn" onClick={(e) => touch(p, e)}>
              touch
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StudioPanel() {
  const { projects, rows } = useStaleProjects(WALL_LIMITS.studio);

  return (
    <Panel
      title="Studio"
      accent={4}
      to="/studio"
      fact={projects.length > 0 ? `${projects.length} active` : null}
      className="panel-studio"
    >
      {projects.length === 0 && <p className="empty">No projects yet.</p>}
      {projects.length > 0 && rows.length === 0 && (
        <p className="empty">
          <Icon name="sparkles" size={16} /> Everything touched today.
        </p>
      )}
      <div className="wall-list">
        {rows.map(({ p, stale }) => (
          <div className="wall-line" key={p.id}>
            <Link to={`/studio/p/${p.id}`} className="wall-name">
              {p.name}
            </Link>
            <span className="muted small">{stale === null ? 'never' : `${stale}d`}</span>
            <button className="pill-btn" onClick={(e) => touch(p, e)}>
              touch
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- rocks ---------- */

/*
 * The barrels at a glance. This is the panel most likely to be the reason the
 * app got opened at all, so it says what's happening in each barrel and
 * nothing else — opening one has a reveal, and the reveal lives on its page.
 */
function useBarrelSlots() {
  const { barrelCount, barrels } = useTumbler();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const bySlot = barrelsBySlot(barrels, now);
  const slots = Array.from({ length: barrelCount }, (_, i) => ({
    slot: i,
    barrel: bySlot.get(i),
    state: barrelState(bySlot.get(i), now),
  }));

  return { slots, ready: slots.filter((s) => s.state === 'ready').length, now };
}

function TumblerCard() {
  const { slots, ready, now } = useBarrelSlots();

  return (
    <Card
      title={ready > 0 ? `Rocks · ${ready} ready` : 'Rocks'}
      accent={6}
      to="/tumbler"
      className="card-tumbler"
    >
      <div className="stack-sm">
        {slots.map(({ slot, barrel, state }) => (
          <div className="row" key={slot}>
            <Icon name="barrel" size={18} />
            <span className="grow">
              {state === 'ready' && 'Finished'}
              {state === 'running' && formatRemaining(remainingMs(barrel, now))}
              {state === 'idle' && <span className="muted">Empty</span>}
            </span>
            {state === 'ready' && <span className="badge success">open</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RocksPanel() {
  const { slots, ready, now } = useBarrelSlots();

  return (
    <Panel
      title="Rocks"
      accent={6}
      to="/tumbler"
      fact={ready > 0 ? `${ready} ready` : null}
      factBadge
      className="panel-rocks"
    >
      <div className="wall-rows">
        {slots.map(({ slot, barrel, state }) => (
          <div className={`barrel-well${state === 'ready' ? ' ready' : ''}`} key={slot}>
            <Icon name="barrel" size={16} />
            <span className="wall-name">
              {state === 'ready' && 'Finished'}
              {state === 'running' && formatRemaining(remainingMs(barrel, now))}
              {state === 'idle' && <span className="muted">Empty</span>}
            </span>
            {state === 'ready' && <span className="badge success">open</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- shop ---------- */

/*
 * What's within reach of the balance, and anything bought but not yet
 * collected. This replaced the old Inventory card — a Home card for a
 * sub-page broke the one-level-down rule, and "N within reach" is the
 * section-level fact the old card never said.
 */
function useShopDigest() {
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

  return { balance, items, unredeemed, affordable };
}

function ShopCard() {
  const { items, unredeemed, affordable } = useShopDigest();

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

function ShopPanel() {
  const { balance, items, unredeemed, affordable } = useShopDigest();
  // Cheapest first: the useful question here is what the balance is closest to
  // buying, not what the shelf happens to be sorted by.
  const next = [...items].sort((a, b) => a.cost - b.cost).slice(0, WALL_LIMITS.shop);

  return (
    <Panel
      title="Shop"
      accent={5}
      to="/shop"
      fact={items.length > 0 ? `${affordable} within reach` : null}
      className="panel-shop"
    >
      {items.length === 0 && unredeemed.length === 0 && (
        <p className="empty">The shelves are bare.</p>
      )}
      <div className="wall-list">
        {/* A bought-and-uncollected thing goes first: it's the only row here
            that's about something you already own. Collecting it is still on
            the Inventory page — this panel says what's waiting, it doesn't
            spend or redeem anything. */}
        {unredeemed.map((p) => (
          <div className="shop-waiting" key={p.id}>
            <Icon name="box" size={16} />
            <span className="wall-name">{p.name_snapshot}</span>
            <span className="waiting-tag">unopened</span>
          </div>
        ))}
        {next.map((i) => {
          const reach = balance != null && i.cost <= balance;
          return (
            <div className="wall-line" key={i.id}>
              <span className={`wall-name${reach ? '' : ' muted'}`}>{i.name}</span>
              <span className="points-tally">
                <Icon name="spark" size={13} /> {i.cost}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
