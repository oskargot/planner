import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  UPGRADES,
  summarise,
  barrelState,
  remainingMs,
  formatRemaining,
  cycleDuration,
  upgradeCost,
  startBarrel,
  collectBarrel,
  crushGem,
  buyUpgrade,
} from '../db/tumbler.js';
import { CYCLES, gemLabel, gritValue, SPECIES_BY_KEY } from '../tumbler/gems.js';
import { confettiBurst } from '../fx.js';
import Gem from '../tumbler/Gem.jsx';
import Icon from '../components/Icon.jsx';

/*
 * The tumbler (§ the rock shop). Load a barrel, leave, come back to a stone.
 *
 * The design constraint that shapes this whole screen: it must be worth
 * opening and must never be a chore. So there is no timer to miss, nothing
 * spoils, nothing decays, and a finished barrel waits indefinitely. The only
 * thing real time buys is better odds.
 */

// One shared clock for the page rather than a timer per barrel. It only has to
// be accurate enough to tick a countdown; barrel state itself is computed from
// timestamps, so a missed tick can't desync anything.
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useTumbler() {
  const ledger = useLiveQuery(() => db.tumbler_ledger.toArray(), [], []);
  const barrels = useLiveQuery(
    () => db.tumbler_barrels.filter((b) => !b.deleted).toArray(),
    [],
    []
  );
  return { ...summarise(ledger), barrels };
}

export default function Tumbler() {
  const now = useNow();
  const { grit, levels, barrelCount, barrels } = useTumbler();
  // The gem being revealed, if any — the one modal moment in the whole app.
  const [reveal, setReveal] = useState(null);

  const slots = Array.from({ length: barrelCount }, (_, i) => i);
  const bySlot = new Map(barrels.map((b) => [b.slot, b]));
  const ready = slots.filter((s) => barrelState(bySlot.get(s), now) === 'ready').length;

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-6)' }} />
        Tumbler
        <span className="points-tally grit" style={{ marginLeft: 'auto' }}>
          <Icon name="gem" size={16} /> {grit}
        </span>
      </h1>

      <p className="tumbler-blurb">
        {ready > 0
          ? `${ready === 1 ? 'A barrel has' : `${ready} barrels have`} finished. Open ${ready === 1 ? 'it' : 'them'}.`
          : 'Load a barrel and leave it. Longer cycles come out better.'}
      </p>

      <div className="barrels">
        {slots.map((slot) => (
          <Barrel
            key={slot}
            slot={slot}
            barrel={bySlot.get(slot)}
            now={now}
            levels={levels}
            onOpen={setReveal}
          />
        ))}
      </div>

      <Workshop grit={grit} levels={levels} />

      {reveal && <Reveal gem={reveal} close={() => setReveal(null)} />}
    </>
  );
}

function Barrel({ slot, barrel, now, levels, onOpen }) {
  const state = barrelState(barrel, now);
  const [busy, setBusy] = useState(false);

  async function load(cycleKey) {
    if (busy) return;
    setBusy(true);
    try {
      await startBarrel(slot, cycleKey, {
        speedLevel: levels.speed,
        qualityLevel: levels.quality,
      });
    } finally {
      setBusy(false);
    }
  }

  async function open(e) {
    if (busy) return;
    setBusy(true);
    const btn = e.currentTarget;
    try {
      const gem = await collectBarrel(slot);
      if (gem) {
        confettiBurst(btn);
        onOpen(gem);
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === 'ready') {
    return (
      <div className="barrel ready">
        <div className="barrel-face">
          <Icon name="barrel" size={30} />
        </div>
        <div className="grow">
          <div className="barrel-title">Finished</div>
          <div className="muted small">Something's in there.</div>
        </div>
        <button className="btn primary" onClick={open} disabled={busy}>
          Open
        </button>
      </div>
    );
  }

  if (state === 'running') {
    const left = remainingMs(barrel, now);
    const pct = Math.min(100, 100 * (1 - left / Math.max(1, barrel.duration_ms)));
    return (
      <div className="barrel running">
        <div className="barrel-face spinning">
          <Icon name="barrel" size={30} />
        </div>
        <div className="grow">
          <div className="barrel-title">{formatRemaining(left)}</div>
          {/* The bar is redundant with the text on purpose — the number is the
              truth, the bar is just faster to read at a glance. */}
          <div className="progress" style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ width: `${pct}%`, '--progress-accent': 'var(--accent-6)' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="barrel idle">
      <div className="barrel-face">
        <Icon name="barrel" size={30} />
      </div>
      <div className="grow">
        <div className="barrel-title muted">Empty</div>
        <div className="cycle-row">
          {CYCLES.map((c) => (
            <button
              key={c.key}
              className="btn cycle-btn"
              onClick={() => load(c.key)}
              disabled={busy}
              title={`${c.name} — ${formatRemaining(cycleDuration(c.key, levels.speed))}`}
            >
              <span className="cycle-name">{c.name}</span>
              <span className="cycle-time">
                {formatRemaining(cycleDuration(c.key, levels.speed))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/*
 * The reveal. Keep puts the stone on the shelf; Crush turns it into grit right
 * here. Either way the collection log has already recorded the discovery — the
 * gem row exists the moment the barrel is opened — so crushing a duplicate
 * costs nothing but the object itself.
 */
function Reveal({ gem, close }) {
  const [crushed, setCrushed] = useState(null);
  const species = SPECIES_BY_KEY[gem.species];

  async function crush() {
    const value = await crushGem(gem);
    setCrushed(value);
  }

  return (
    <div className="reveal-backdrop" onClick={close}>
      <div className="reveal sheet" onClick={(e) => e.stopPropagation()}>
        <Gem gem={gem} size={140} />
        <div className="reveal-name">{gemLabel(gem)}</div>
        {species?.rare && <div className="reveal-rare">rare</div>}
        {crushed === null ? (
          <>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <button className="btn" onClick={crush}>
                Crush for {gritValue(gem)}
              </button>
              <button className="btn primary" onClick={close}>
                Keep
              </button>
            </div>
            <p className="muted small" style={{ textAlign: 'center' }}>
              Either way it's logged in your collection.
            </p>
          </>
        ) : (
          <>
            <p className="muted small">
              Crushed for <strong>{crushed}</strong> grit.
            </p>
            <button className="btn primary" onClick={close}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Workshop({ grit, levels }) {
  return (
    <section className="workshop">
      <h2 className="section-heading">Workshop</h2>
      {Object.entries(UPGRADES).map(([key, u]) => {
        const level = levels[key];
        const cost = upgradeCost(key, level);
        const maxed = cost === null;
        const affordable = !maxed && cost <= grit;
        return (
          <div className="list-item upgrade" key={key}>
            <div className="grow">
              <div className="item-title">
                {u.name}
                <span className="upgrade-level">
                  {level}/{u.max}
                </span>
              </div>
              <div className="muted small">{u.blurb}</div>
            </div>
            <button
              className={`btn${affordable ? ' primary' : ''}`}
              disabled={!affordable}
              onClick={() => buyUpgrade(key, level, grit)}
            >
              {maxed ? 'maxed' : (
                <>
                  <Icon name="gem" size={13} /> {cost}
                </>
              )}
            </button>
          </div>
        );
      })}
    </section>
  );
}
