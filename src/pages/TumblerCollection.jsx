import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { SPECIES, GRADES } from '../tumbler/gems.js';
import Gem from '../tumbler/Gem.jsx';
import Icon from '../components/Icon.jsx';

/*
 * The collection log: nine species × five grades. This is the completion pull
 * the whole game hangs on, and the reason crushing a stone is never a mistake
 * — a discovery is recorded by the gem row EXISTING, including tombstoned
 * ones, so what you've found is separate from what you've kept.
 *
 * The first example of each combination is the one drawn, so a square you
 * filled months ago keeps showing the stone that actually filled it.
 */
export default function TumblerCollection() {
  const all = useLiveQuery(() => db.gems.toArray(), [], []);

  // First-found wins, so the grid is stable as the collection grows.
  const found = new Map();
  for (const g of [...all].sort((a, b) => a.created_at - b.created_at)) {
    const key = `${g.species}:${g.grade}`;
    if (!found.has(key)) found.set(key, g);
  }

  const total = SPECIES.length * GRADES.length;

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-6)' }} />
        Collection
        <span className="muted" style={{ marginLeft: 'auto', fontWeight: 'var(--weight-normal)' }}>
          {found.size}/{total}
        </span>
      </h1>

      <div className="collection">
        {/* Corner cell, then the grade headings — a plain table would fight the
            square cells, so this is a grid with its own header row. */}
        <div className="collection-corner" />
        {GRADES.map((g) => (
          <div className="collection-head" key={g.key}>
            {g.name}
          </div>
        ))}

        {SPECIES.map((s) => (
          <Row key={s.key} species={s} found={found} />
        ))}
      </div>

      <p className="muted small" style={{ marginTop: 'var(--space-4)' }}>
        Rare kinds are marked with a dot. Crushing a stone keeps its square
        filled — the log remembers what you found, the shelf holds what you kept.
      </p>
    </>
  );
}

function Row({ species, found }) {
  return (
    <>
      <div className={`collection-species${species.rare ? ' rare' : ''}`}>
        {species.rare && <span className="rare-dot" aria-label="rare" />}
        {species.name}
      </div>
      {GRADES.map((g, gi) => {
        const gem = found.get(`${species.key}:${gi}`);
        return (
          <div className={`collection-cell${gem ? ' filled' : ''}`} key={g.key}>
            {gem ? (
              <Gem gem={gem} size={40} title={`${g.name} ${species.name}`} />
            ) : (
              <Icon name="gem" size={18} />
            )}
          </div>
        );
      })}
    </>
  );
}
