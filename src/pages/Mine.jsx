import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  allChunks,
  chunkLookup,
  digCell,
  extractCell,
  getWorldSeed,
  EXTRACT_COST,
} from '../db/mine.js';
import { isGem, gemAt, neighbourCount, seedNumber, density } from '../mine/board.js';
import { useTumbler, Reveal, Workshop } from './Tumbler.jsx';
import { gemLabel, SPECIES_BY_KEY } from '../tumbler/gems.js';
import { showToast } from '../toast.js';
import { useWide } from '../useMediaQuery.js';
import Icon from '../components/Icon.jsx';

/*
 * The mine. Minesweeper with the polarity reversed: the gems are the mines.
 *
 * Tap to swing the pick — free, and how you learn anything, because empty
 * ground tells you how many gems it's touching. Hold (or right-click) to
 * extract carefully, which costs grit and is the only way a stone comes out
 * whole. Swing at a gem and it shatters: you get shards, and it fills no
 * square in the collection. That's the entire cost of being careless, and it
 * needs no fail state, no timer and no way to lose anything you already had.
 *
 * The board is infinite and stored nowhere — see mine/board.js. What's here is
 * the viewport, the gestures, and nothing else.
 */

// Big enough to hit with a thumb, small enough that a phone still shows enough
// board to reason about. Below about nine columns the deduction stops working
// because you can't see a whole frontier at once.
const CELL = 38;

// The numbers ride the rainbow rather than minesweeper's traditional palette —
// -ink variants, because these are glyphs and the pastels aren't readable as
// text. Eight is possible but vanishingly rare at these densities.
const COUNT_ACCENT = [null, 5, 4, 1, 6, 2, 3, 1, 1];

export default function Mine() {
  const wide = useWide();
  const { grit, levels } = useTumbler();
  const prestige = levels.prestige;

  /*
   * Live, because a prestige reset replaces it underneath us and the board has
   * to follow immediately rather than on the next navigation.
   *
   * The `?? null` matters: Dexie returns undefined for a missing row, and
   * useLiveQuery returns its default until the query resolves. Leaving both as
   * undefined makes "still loading" and "no world yet" the same value, and the
   * first visit sits on the placeholder forever waiting for a seed nothing
   * ever mints.
   */
  const seedRow = useLiveQuery(
    () => db.meta.get('mine_seed').then((r) => r ?? null),
    [],
    undefined
  );
  const worldSeed = seedRow?.value ?? null;
  useEffect(() => {
    if (seedRow === null) getWorldSeed(); // first visit ever: stake a claim
  }, [seedRow]);

  const chunks = useLiveQuery(() => allChunks(), [], []);
  const [origin, setOrigin] = useState({ x: -4, y: -4 });
  const [cols, setCols] = useState(9);
  const [reveal, setReveal] = useState(null);
  const [holding, setHolding] = useState(null);
  const busy = useRef(false);
  const boardRef = useRef(null);

  const rows = wide ? 14 : 11;

  /*
   * How many columns fit. Depends on worldSeed because until there is one the
   * page renders a placeholder and the board node doesn't exist — with an
   * empty dependency list this ran once against a null ref and the grid stayed
   * at its initial nine columns forever, on a screen with room for thirty.
   */
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w) setCols(Math.max(5, Math.floor(w / CELL)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldSeed]);

  const lookup = chunkLookup(chunks, worldSeed);
  const seed = worldSeed ? seedNumber(worldSeed) : 0;

  const act = useCallback(
    async (x, y, careful) => {
      if (busy.current || !worldSeed) return;
      busy.current = true;
      try {
        if (careful) {
          const res = await extractCell(worldSeed, prestige, x, y, lookup, grit);
          if (!res) return;
          if (res.kind === 'poor') {
            showToast(`Not enough grit — an extraction costs ${EXTRACT_COST}`, { tone: 'danger' });
          } else if (res.kind === 'empty') {
            showToast('Nothing there. That is what the numbers are for.');
          } else {
            setReveal(res.gem);
          }
        } else {
          const res = await digCell(worldSeed, prestige, x, y, lookup);
          if (res?.kind === 'shattered') {
            showToast(
              `Shattered a ${gemLabel(res.gem)} — ${res.shards} shard${
                res.shards === 1 ? '' : 's'
              }, and no square filled`,
              { tone: 'danger' }
            );
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [worldSeed, prestige, lookup, grit]
  );

  const gestures = usePickaxe({ origin, setOrigin, act, setHolding });

  if (!worldSeed) return <p className="empty">Opening the mine…</p>;

  const cells = [];
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x = origin.x + rx;
      const y = origin.y + ry;
      cells.push(<Cell key={`${x},${y}`} x={x} y={y} seed={seed} prestige={prestige} lookup={lookup} holding={holding} />);
    }
  }

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-6)' }} />
        Mine
        <span className="points-tally grit" style={{ marginLeft: 'auto' }}>
          <Icon name="gem" size={16} /> {grit}
        </span>
      </h1>

      <p className="tumbler-blurb">
        Dig anywhere — it's free, and open ground counts the gems around it.
        Extract carefully for {EXTRACT_COST} grit and the stone comes out whole.
        Swing at one and it shatters.
      </p>

      <div className="mine-bar">
        <span className="muted small grow">
          {origin.x + Math.floor(cols / 2)}, {origin.y + Math.floor(rows / 2)}
          {prestige > 0 && ` · claim ${prestige} · ${Math.round(density(prestige) * 100)}% ground`}
        </span>
        <button className="btn" onClick={() => setOrigin({ x: -Math.floor(cols / 2), y: -Math.floor(rows / 2) })}>
          Recentre
        </button>
      </div>

      {/* One set of handlers for the whole board rather than a hook per cell:
          at eleven rows that would be a hundred and fifty live timers, and the
          pan has to be able to cancel a press that started on any of them. */}
      <div
        className="mine-board"
        ref={boardRef}
        style={{ '--mine-cols': cols, '--mine-cell': `${CELL}px` }}
        {...gestures}
      >
        {cells}
      </div>

      <p className="longpress-hint" style={{ marginTop: 'var(--space-3)' }}>
        <Icon name="pencil" size={12} />
        <span className="hint-touch">tap to dig · hold to extract · drag to move</span>
        <span className="hint-pointer">click to dig · right-click to extract · drag to move</span>
      </p>

      {/* Prestige lives here, under the ground it rerolls, rather than at the
          foot of the barrels page where it bought nothing you could see. */}
      <Workshop grit={grit} levels={levels} keys={['prestige']} title="The claim" />

      {reveal && <Reveal gem={reveal} close={() => setReveal(null)} />}
    </>
  );
}

function Cell({ x, y, seed, prestige, lookup, holding }) {
  const dug = lookup.isDug(x, y);
  const key = `${x},${y}`;
  const held = holding === key;

  if (!dug) {
    return (
      <button
        className={`mine-cell covered${held ? ' holding' : ''}`}
        data-cell={key}
        aria-label={`Dig ${x}, ${y}`}
      />
    );
  }

  // The board is pure, so a dug cell still knows it held a gem. Whether it
  // came out whole is the only thing that had to be stored.
  if (isGem(seed, x, y, prestige)) {
    const whole = lookup.isWhole(x, y);
    const gem = gemAt(seed, x, y, prestige);
    const species = SPECIES_BY_KEY[gem.species];
    return (
      <div
        className={`mine-cell ${whole ? 'taken' : 'broken'}`}
        data-cell={key}
        title={`${whole ? 'Extracted' : 'Shattered'} — ${gemLabel(gem)}`}
        style={{ '--cell-accent': `var(--accent-${species?.accent ?? 6}-ink)` }}
      >
        <Icon name={whole ? 'gem' : 'shards'} size={19} />
      </div>
    );
  }

  const n = neighbourCount(seed, x, y, prestige);
  return (
    <div
      className="mine-cell open"
      data-cell={key}
      style={n ? { color: `var(--accent-${COUNT_ACCENT[n]}-ink)` } : undefined}
    >
      {n || ''}
    </div>
  );
}

/*
 * The gestures, all three sharing one pointer.
 *
 * Drag has to win over both tap and hold, or the board is unusable: every pan
 * would end in a dig somewhere. So movement past a small threshold cancels the
 * press outright, exactly the way useLongPress guards against a hold turning
 * into a scroll flick. Panning is tracked from the pointer's start position
 * rather than accumulated per event, so it can't drift over a long drag.
 */
const HOLD_MS = 450;
const DRAG_SLOP = 8;

function usePickaxe({ origin, setOrigin, act, setHolding }) {
  const start = useRef(null);
  const timer = useRef(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(null);
  }, [setHolding]);

  useEffect(() => clear, [clear]);

  function cellFrom(e) {
    const el = e.target.closest?.('[data-cell]');
    if (!el) return null;
    const [x, y] = el.dataset.cell.split(',').map(Number);
    return { x, y, key: el.dataset.cell };
  }

  return {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = cellFrom(e);
      fired.current = false;
      start.current = {
        px: e.clientX,
        py: e.clientY,
        origin: { ...origin },
        cell,
        dragged: false,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (!cell) return;
      setHolding(cell.key);
      timer.current = setTimeout(() => {
        fired.current = true;
        clear();
        navigator.vibrate?.(12);
        act(cell.x, cell.y, true);
      }, HOLD_MS);
    },

    onPointerMove(e) {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (!s.dragged && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      s.dragged = true;
      clear();
      // Whole cells only. Sub-cell panning would need the grid to render a
      // partial row and a pixel offset, and the board is a lattice — there's
      // nothing to see between two cells.
      setOrigin({
        x: s.origin.x - Math.round(dx / CELL),
        y: s.origin.y - Math.round(dy / CELL),
      });
    },

    onPointerUp() {
      const s = start.current;
      start.current = null;
      const pending = timer.current !== null;
      clear();
      if (!s || s.dragged || fired.current || !pending || !s.cell) return;
      act(s.cell.x, s.cell.y, false);
    },

    onPointerCancel() {
      start.current = null;
      clear();
    },

    // Right-click is the trackpad's extract, and it also suppresses iOS's own
    // long-press callout on the way through.
    onContextMenu(e) {
      e.preventDefault();
      const cell = cellFrom(e);
      if (!cell || fired.current) return;
      fired.current = true;
      clear();
      act(cell.x, cell.y, true);
    },
  };
}
