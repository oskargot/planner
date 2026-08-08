import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { barrelState, barrelsBySlot, remainingMs, formatRemaining } from '../db/tumbler.js';
import { EXTRACT_COST } from '../db/mine.js';
import { SPECIES, GRADES, gemLabel } from '../tumbler/gems.js';
import Gem from '../tumbler/Gem.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import { useTumbler } from './Tumbler.jsx';

/*
 * The Rocks dashboard (design.md §1). Four sub-pages in two pairs: the left
 * column is the two activities (barrels turning, ground to dig), the right is
 * the two holdings (the shelf, the log). Grit lives on the Mine card because
 * the mine is where grit gets spent; the barrels card tells time instead.
 *
 * Everything here reads; opening a barrel, digging and crushing all stay on
 * their pages. This is the section most likely to outgrow the card grid —
 * design.md §2 wants it drawn as a workshop map eventually.
 */
export default function RocksDash() {
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-6)' }} />
        Rocks
      </h1>
      <div className="dash-grid">
        <div className="dash-col">
          <BarrelsCard />
          <MineCard />
        </div>
        <div className="dash-col">
          <ShelfCard />
          <CollectionCard />
        </div>
      </div>
    </>
  );
}

function BarrelsCard() {
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
    <Card title={ready > 0 ? `Barrels · ${ready} ready` : 'Barrels'} accent={6} to="/tumbler/barrels">
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

function MineCard() {
  const { levels } = useTumbler();
  const prestige = levels?.prestige ?? 0;

  // No grit tally — the frame carries it on every Rocks screen (design.md §2).
  return (
    <Card title="Mine" accent={6} to="/tumbler/mine">
      <p className="muted small">
        Digging is free · extraction costs {EXTRACT_COST} grit.
      </p>
      {prestige > 0 && (
        <p className="muted small" style={{ marginTop: 'var(--space-2)' }}>
          World {prestige + 1} — richer ground, harder reads.
        </p>
      )}
    </Card>
  );
}

function ShelfCard() {
  const kept = useLiveQuery(
    async () => {
      const rows = await db.gems.filter((g) => !g.deleted).sortBy('created_at');
      return rows.reverse();
    },
    [],
    []
  );

  return (
    <Card title={kept.length ? `Shelf · ${kept.length}` : 'Shelf'} accent={6} to="/tumbler/shelf">
      {kept.length === 0 && <p className="muted small">No stones kept yet.</p>}
      {kept.length > 0 && (
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {kept.slice(0, 4).map((g) => (
            <Gem key={g.id} gem={g} size={34} title={gemLabel(g)} />
          ))}
          <span className="muted small grow">latest: {gemLabel(kept[0])}</span>
        </div>
      )}
    </Card>
  );
}

function CollectionCard() {
  const all = useLiveQuery(() => db.gems.toArray(), [], []);

  // Same first-found rule as the Collection page: tombstones count, so a
  // crushed stone keeps its square.
  const found = new Map();
  for (const g of [...all].sort((a, b) => a.created_at - b.created_at)) {
    const key = `${g.species}:${g.grade}`;
    if (!found.has(key)) found.set(key, g);
  }
  const total = SPECIES.length * GRADES.length;
  const latest = [...found.values()].sort((a, b) => b.created_at - a.created_at)[0];

  return (
    <Card title={`Collection · ${found.size}/${total}`} accent={6} to="/tumbler/collection">
      {!latest && <p className="muted small">Nothing discovered yet.</p>}
      {latest && <p className="muted small">Last discovery: {gemLabel(latest)}</p>}
    </Card>
  );
}
