import { Link } from 'react-router-dom';
import { useStats } from '../db/selectors.js';
import { prettyDay } from '../db/time.js';
import { itemAccent } from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';

/*
 * Stats.
 *
 * Everything here already existed in the ledger; none of it was ever shown.
 * The ledger page answers "what happened" one row at a time, which is the
 * wrong shape for "am I actually doing this" — that question needs thirty days
 * at once, and thirty days at once needs the iPad's width. That's why this is
 * the screen the wide layout gets the most out of.
 *
 * Two rules it holds to. Nothing is stored: every number is derived, so a stat
 * can't drift from the history it came from. And no grit — the tumbler is a
 * separate economy and this page belongs to points. A combined "score" would
 * be the first crack in that wall.
 */
export default function Stats() {
  const s = useStats();

  if (!s) return <p className="empty">Counting…</p>;

  const sources = [
    { key: 'task', label: 'Tasks', accent: 2, value: s.bySource.task },
    { key: 'habit', label: 'Habits', accent: 3, value: s.bySource.habit },
    { key: 'project', label: 'Projects', accent: 4, value: s.bySource.project },
    // Discoveries are the only points the rock economy pays, and they're
    // one-per-square for life — so this bar can only ever shrink as a share.
    { key: 'discovery', label: 'Discoveries', accent: 6, value: s.bySource.discovery },
    { key: 'adjust', label: 'Adjustments', accent: 5, value: Math.max(0, s.bySource.adjust) },
  ].filter((r) => r.value > 0);
  const totalSourced = Math.max(
    1,
    sources.reduce((sum, r) => sum + r.value, 0)
  );

  return (
    <>
      {/* No nav section owns this page, so it carries its own way back. */}
      <Link className="back-link" to="/settings">
        <Icon name="chevronLeft" size={14} /> Settings
      </Link>

      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-1)' }} />
        Stats
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 'var(--weight-normal)' }}>
          last {s.windowDays} days
        </span>
      </h1>

      <div className="tiles">
        <Tile label="Balance" value={s.balance} icon="spark" accent={3} />
        <Tile label="Earned, all time" value={s.lifetimeEarned} icon="sparkles" accent={4} />
        <Tile label="Spent, all time" value={s.lifetimeSpent} icon="shop" accent={5} />
        <Tile label="Tasks finished" value={s.tasksDone} icon="tasks" accent={2} />
      </div>

      <div className="stats-grid">
        <section className="card">
          <h2 className="section-heading">Points a day</h2>
          {/* One column per day, height relative to the best day in the window.
              No axis: the shape is the point, and the exact number is a
              tooltip away. */}
          <div className="bars">
            {s.days.map((d) => (
              <div
                className="bar-slot"
                key={d.day}
                title={`${d.day} — ${d.earned} earned${d.spent ? `, ${d.spent} spent` : ''}`}
              >
                <div
                  className="bar"
                  style={{
                    height: `${Math.round((d.earned / s.peak) * 100)}%`,
                    background:
                      d.day === s.today ? 'var(--accent-3)' : 'var(--accent-5)',
                  }}
                />
              </div>
            ))}
          </div>
          <p className="muted small">
            Best day was {prettyDay(s.bestDay.day)} with {s.bestDay.earned}.
          </p>
        </section>

        <section className="card">
          <h2 className="section-heading">Where points come from</h2>
          {sources.length === 0 && <p className="empty">Nothing earned yet.</p>}
          {sources.length > 0 && (
            <>
              <div className="share">
                {sources.map((r) => (
                  <div
                    key={r.key}
                    className="share-seg"
                    style={{
                      width: `${(r.value / totalSourced) * 100}%`,
                      background: `var(--accent-${r.accent})`,
                    }}
                    title={`${r.label}: ${r.value}`}
                  />
                ))}
              </div>
              <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
                {sources.map((r) => (
                  <div className="row" key={r.key}>
                    <span
                      className="accent-dot"
                      style={{ background: `var(--accent-${r.accent})` }}
                    />
                    <span className="grow">{r.label}</span>
                    <span className="muted">{Math.round((r.value / totalSourced) * 100)}%</span>
                    <span className="bold mono">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="section-heading">Habits</h2>
          {s.habits.length === 0 && <p className="empty">No habits yet.</p>}
          <div className="stack-sm">
            {s.habits.map((h, i) => (
              <div className="habit-stat" key={h.id}>
                <div className="row">
                  {h.emoji && <span>{h.emoji}</span>}
                  <span className="grow item-title">{h.name}</span>
                  {h.streak > 1 && (
                    <span className="streak" title={`${h.streak} days in a row`}>
                      <Icon name="sparkles" size={12} /> {h.streak}
                    </span>
                  )}
                  <span className="muted small">{Math.round(h.ratio * 100)}%</span>
                </div>
                {/* One cell per day in the window. -1 means the habit didn't
                    exist yet, and it's drawn as nothing at all rather than as
                    a miss — the same rule the heat map's denominator uses. */}
                <div className="strip">
                  {h.marks.map((m, j) => (
                    <span
                      key={j}
                      className={`strip-cell${m === -1 ? ' void' : ''}`}
                      style={
                        m === 1
                          ? { background: `var(--accent-${itemAccent(h, i)})` }
                          : undefined
                      }
                    />
                  ))}
                </div>
                <div className="muted small">
                  {h.done}/{h.eligible} days · best run {h.best}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-heading">Tasks a week</h2>
          <div className="bars tall">
            {s.weeks.map((w) => (
              <div
                className="bar-col"
                key={w.start}
                title={`${w.start} → ${w.end}: ${w.count} tasks, ${w.points} points`}
              >
                <div className="bar-slot">
                  <div
                    className="bar"
                    style={{
                      height: `${Math.round((w.count / s.weekPeak) * 100)}%`,
                      background: 'var(--accent-2)',
                    }}
                  />
                </div>
                <span className="bar-label">{w.count}</span>
              </div>
            ))}
          </div>
          <div className="row spread muted small">
            <span>8 weeks ago</span>
            <span>this week</span>
          </div>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            <span className="grow muted small">By size, all time</span>
            {Object.entries(s.sizes).map(([k, v]) => (
              <span className="size-chip" key={k}>
                {k}·{v}
              </span>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section-heading">Projects</h2>
          {s.projects.length === 0 && <p className="empty">No active projects.</p>}
          <div className="stack-sm">
            {s.projects.map((p) => (
              <div className="row" key={p.id}>
                <span
                  className="accent-dot"
                  style={{ background: `var(--accent-${p.color || 4})` }}
                />
                <Link to={`/studio/p/${p.id}`} className="grow">
                  {p.name}
                </Link>
                <span className="muted small">
                  {p.stale === null ? 'never touched' : `${p.stale}d ago`}
                </span>
                <span className="bold mono">{p.touched}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Days worked on, out of the last {s.windowDays}.</p>
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, icon, accent }) {
  return (
    <div className="tile" style={{ '--tile-accent': `var(--accent-${accent})` }}>
      <div className="tile-value">
        <Icon name={icon} size={16} /> {value}
      </div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
