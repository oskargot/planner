import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { crushGem } from '../db/tumbler.js';
import { useTumbler } from './Tumbler.jsx';
import { gemLabel, gritValue, SPECIES_BY_KEY, GRADES } from '../tumbler/gems.js';
import Gem from '../tumbler/Gem.jsx';
import Icon from '../components/Icon.jsx';
import useLongPress from '../useLongPress.js';

// Same shelf furniture as the shop, same reason it can't be CSS auto-fill:
// each shelf draws its own plank, so the rows have to be real.
function usePerShelf() {
  const [n, setN] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches ? 5 : 3
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)');
    const update = () => setN(mq.matches ? 5 : 3);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return n;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const SORTS = {
  newest: { label: 'Newest', cmp: (a, b) => b.created_at - a.created_at },
  grade: { label: 'Grade', cmp: (a, b) => b.grade - a.grade || b.created_at - a.created_at },
  species: {
    label: 'Kind',
    cmp: (a, b) => a.species.localeCompare(b.species) || b.grade - a.grade,
  },
};

export default function TumblerShelf() {
  const { grit } = useTumbler();
  const [sort, setSort] = useState('newest');
  const perShelf = usePerShelf();
  const gems = useLiveQuery(() => db.gems.filter((g) => !g.deleted).toArray(), [], []);

  const sorted = [...gems].sort(SORTS[sort].cmp);
  const shelves = chunk(sorted, perShelf);

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-6)' }} />
        Shelf
        <span className="points-tally grit" style={{ marginLeft: 'auto' }}>
          <Icon name="gem" size={16} /> {grit}
        </span>
      </h1>

      {gems.length > 0 && (
        <div className="row spread" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="row" style={{ gap: 'var(--space-1)' }}>
            {Object.entries(SORTS).map(([key, s]) => (
              <button
                key={key}
                className="size-chip"
                onClick={() => setSort(key)}
                style={
                  sort === key
                    ? { background: 'var(--accent-6-soft)', color: 'var(--text-primary)' }
                    : undefined
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="longpress-hint">
            <Icon name="pencil" size={12} /> hold to crush
          </span>
        </div>
      )}

      <div className="cabinet">
        {gems.length === 0 && (
          <p className="shelf-empty">Nothing on the shelf yet. Go load a barrel.</p>
        )}
        {shelves.map((row, i) => (
          <div className="shelf" key={i}>
            <div className="shelf-items gem-shelf" style={{ '--per-shelf': perShelf }}>
              {row.map((gem) => (
                <ShelfGem key={gem.id} gem={gem} />
              ))}
            </div>
            <div className="plank" />
          </div>
        ))}
      </div>
    </>
  );
}

/*
 * Crushing is destructive and irreversible, so it's a long-press plus a
 * confirm rather than a button you can brush past on a shelf of things you
 * spent real days growing.
 */
function ShelfGem({ gem }) {
  const species = SPECIES_BY_KEY[gem.species];
  const { handlers, holding } = useLongPress(() => {
    const value = gritValue(gem);
    if (confirm(`Crush your ${gemLabel(gem)} for ${value} grit? It stays in your collection log.`)) {
      crushGem(gem);
    }
  });

  return (
    <div
      className={`gem-slot longpress${holding ? ' holding' : ''}${species?.rare ? ' rare' : ''}`}
      {...handlers}
    >
      <Gem gem={gem} size={62} />
      <div className="gem-caption">
        <span className="gem-grade">{GRADES[gem.grade]?.name}</span>
        <span className="gem-species">{species?.name}</span>
      </div>
    </div>
  );
}
