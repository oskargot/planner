import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { updateHabit, deleteHabit, restoreHabit } from '../db/actions.js';
import { useHabitStreaks } from '../db/selectors.js';
import { showToast } from '../toast.js';
import { itemAccent } from '../components/ColorPicker.jsx';
import Icon from '../components/Icon.jsx';

/*
 * Archived habits.
 *
 * This page exists because archiving used to be a one-way door: the editor's
 * Archive button set active = 0, every list in the app filtered on active, and
 * there was no screen anywhere that could show the row again. The habit and
 * its whole history were still in the database, still counted in the heat
 * map's denominator for the days it was live, and completely unreachable.
 *
 * Archive is deliberately not delete: the entries stay, the points stay, and
 * the heat map keeps treating those days as days the habit was active. Coming
 * back is one tap.
 */
export default function HabitsArchived() {
  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deleted && !h.active).sortBy('sort_order'),
    [],
    []
  );
  const streaks = useHabitStreaks();

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-3)' }} />
        Archived
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 'var(--weight-normal)' }}>
          {habits.length}
        </span>
      </h1>

      {habits.length === 0 && (
        <p className="empty">
          Nothing archived. Habits you retire land here instead of vanishing.
        </p>
      )}

      {habits.map((h, i) => {
        const s = streaks?.get(h.id);
        return (
          <div
            className="list-item"
            key={h.id}
            style={{ borderLeft: `4px solid var(--accent-${itemAccent(h, i)})` }}
          >
            <Icon name="archive" size={18} />
            <span style={{ fontSize: 'var(--size-lg)' }}>{h.emoji}</span>
            <div className="grow">
              <div className="item-title">{h.name}</div>
              {/* What it was worth while it ran — the only reason to keep
                  looking at an archived habit at all. */}
              <div className="muted small">
                {s?.total ? `${s.total} days checked · best run ${s.best}` : 'never checked'}
              </div>
            </div>
            <button className="btn primary" onClick={() => updateHabit(h.id, { active: 1 })}>
              Reactivate
            </button>
            <button
              className="icon-btn"
              aria-label={`Delete ${h.name}`}
              title="Delete (history and points stay)"
              onClick={() => {
                deleteHabit(h.id);
                showToast(`Deleted “${h.name}” — its points stay`, {
                  undo: () => restoreHabit(h.id),
                });
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        );
      })}
    </>
  );
}
