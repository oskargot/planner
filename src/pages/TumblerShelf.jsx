import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { crushGem, uncrushGem, fuseGems } from '../db/tumbler.js';
import { useTumbler, Reveal } from './Tumbler.jsx';
import {
  gemLabel,
  gritValue,
  canFuse,
  FUSE_COUNT,
  SPECIES_BY_KEY,
  GRADES,
} from '../tumbler/gems.js';
import { showToast } from '../toast.js';
import { confettiBurst } from '../fx.js';
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
  const [picked, setPicked] = useState(() => new Set());
  const [reveal, setReveal] = useState(null);
  const perShelf = usePerShelf();
  const gems = useLiveQuery(() => db.gems.filter((g) => !g.deleted).toArray(), [], []);

  const sorted = [...gems].sort(SORTS[sort].cmp);
  const shelves = chunk(sorted, perShelf);

  const chosen = useMemo(() => gems.filter((g) => picked.has(g.id)), [gems, picked]);

  // A stone that leaves the shelf (crushed, fused, synced away) must leave the
  // selection with it, or the Fuse button starts counting stones that aren't
  // there any more.
  useEffect(() => {
    setPicked((prev) => {
      const live = new Set(gems.map((g) => g.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [gems]);

  function togglePick(gem) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(gem.id)) next.delete(gem.id);
      // Picking a fourth would mean silently dropping one of the first three;
      // stopping at three and saying so is less surprising.
      else if (next.size < FUSE_COUNT) next.add(gem.id);
      return next;
    });
  }

  async function fuse(e) {
    const btn = e.currentTarget;
    const gem = await fuseGems(chosen);
    setPicked(new Set());
    if (gem) {
      confettiBurst(btn);
      setReveal(gem);
    }
  }

  const ready = canFuse(chosen);
  // What the three would become — worth saying before they're spent.
  const target = ready ? GRADES[Math.min(GRADES.length - 1, chosen[0].grade + 1)] : null;
  const sameSpecies = ready && chosen.every((g) => g.species === chosen[0].species);

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
        <div className="row spread wrap" style={{ marginBottom: 'var(--space-3)' }}>
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
            <Icon name="pencil" size={12} />
            <span className="hint-touch">tap to pick · hold to crush</span>
            <span className="hint-pointer">click to pick · right-click to crush</span>
          </span>
        </div>
      )}

      {/* The bench. Only appears once you've picked something, and it says
          what the three would turn into before you spend them. */}
      {picked.size > 0 && (
        <div className="fuse-bar">
          <Icon name="fuse" size={18} />
          <div className="grow">
            <div className="item-title">
              {picked.size} of {FUSE_COUNT} picked
            </div>
            <div className="muted small">
              {ready
                ? sameSpecies
                  ? `Three of a kind — you'll get a ${target.name} ${SPECIES_BY_KEY[chosen[0].species]?.name}.`
                  : `You'll get a ${target.name} stone, in one of the three kinds.`
                : chosen.length === FUSE_COUNT
                  ? chosen[0].grade >= GRADES.length - 1
                    ? 'Flawless is the top — nothing to fuse into.'
                    : 'All three have to be the same grade.'
                  : 'Pick three of the same grade to fuse them into a better one.'}
            </div>
          </div>
          <button className="btn ghost" onClick={() => setPicked(new Set())}>
            Clear
          </button>
          <button className="btn primary" disabled={!ready} onClick={fuse}>
            Fuse
          </button>
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
                <ShelfGem
                  key={gem.id}
                  gem={gem}
                  picked={picked.has(gem.id)}
                  onPick={() => togglePick(gem)}
                />
              ))}
            </div>
            <div className="plank" />
          </div>
        ))}
      </div>

      {reveal && <Reveal gem={reveal} close={() => setReveal(null)} />}
    </>
  );
}

/*
 * A stone on the shelf. Tap picks it for fusion; hold crushes it.
 *
 * Crushing used to be a hold plus a confirm() — destructive and irreversible
 * seemed to deserve a dialog. It gets a toast now for the same reason
 * everything else does: the undo restores the stone and takes the grit back
 * out with a second ledger row, so the thing you can do after is strictly
 * better than the question you had to answer before.
 */
function ShelfGem({ gem, picked, onPick }) {
  const species = SPECIES_BY_KEY[gem.species];

  const { handlers, holding, consumedRef } = useLongPress(async () => {
    const value = await crushGem(gem);
    if (!value) return;
    showToast(`Crushed your ${gemLabel(gem)} for ${value} grit`, {
      undo: () => uncrushGem(gem, value),
    });
  });

  return (
    <div
      className={`gem-slot longpress${holding ? ' holding' : ''}${species?.rare ? ' rare' : ''}${
        picked ? ' picked' : ''
      }`}
      {...handlers}
      onClick={() => {
        if (consumedRef.current) return;
        onPick();
      }}
    >
      <Gem gem={gem} size={62} />
      <div className="gem-caption">
        <span className="gem-grade">{GRADES[gem.grade]?.name}</span>
        <span className="gem-species">{species?.name}</span>
      </div>
    </div>
  );
}
