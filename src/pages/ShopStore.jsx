import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import {
  addShopItem,
  updateShopItem,
  deleteShopItem,
  restoreShopItem,
  purchaseItem,
  refundPurchase,
  moveRow,
} from '../db/actions.js';
import { useBalance } from '../db/selectors.js';
import { confettiBurst } from '../fx.js';
import { showToast } from '../toast.js';
import Icon from '../components/Icon.jsx';
import { itemAccent } from '../components/ColorPicker.jsx';
import useLongPress from '../useLongPress.js';

// How many boxes fit on one shelf. This has to be a real number rather than a
// CSS auto-fill, because each shelf renders its own plank underneath — the
// planks have to line up with actual rows. Three across on a phone: two made
// the boxes so tall that one shelf filled the screen.
function usePerShelf() {
  const [n, setN] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches ? 4 : 3
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 700px)');
    const update = () => setN(mq.matches ? 4 : 3);
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

/*
 * The awning, sized to fit.
 *
 * The canvas is a repeating six-band gradient and the valance is a mask with a
 * matching scallop period, both of which were pinned at 28px. Nothing makes a
 * screen 28px times a whole number wide, so the last band was always sliced
 * mid-stripe and the last scallop cut off square — worse on the phone, where
 * the awning is narrow enough that the missing scallop is a sixth of what you
 * see.
 *
 * So the awning measures itself and picks the band width that divides its own
 * width evenly, staying as close to the ideal as it can. Both the stripes and
 * the scallops are derived from that one number, which is what keeps a scallop
 * centred under each colour.
 */
const IDEAL_BAND = 28;

function Awning() {
  const ref = useRef(null);
  const [band, setBand] = useState(IDEAL_BAND);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (!w) return;
      // At least six bands, so the rainbow always makes it round once.
      const bands = Math.max(6, Math.round(w / IDEAL_BAND));
      setBand(w / bands);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="awning" ref={ref} style={{ '--awning-band': `${band}px` }}>
      <span className="awning-title">
        <Icon name="shop" size={18} /> open
      </span>
    </div>
  );
}

export default function ShopStore() {
  const balance = useBalance();
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const perShelf = usePerShelf();
  const items = useLiveQuery(
    () => db.shop_items.filter((i) => !i.deleted).sortBy('sort_order'),
    [],
    []
  );

  const shelves = chunk(items, perShelf);

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-5)' }} />
        Store
        <span className="points-tally" style={{ marginLeft: 'auto' }}>
          <Icon name="spark" size={17} /> {balance ?? '…'}
        </span>
      </h1>

      {/* The shopfront. Purely decorative — the page title above already says
          where you are, so a theme that flattens the stripes loses nothing. */}
      <Awning />

      {editing && (
        <ItemForm
          item={editing === 'new' ? null : editing}
          items={items}
          close={() => setEditing(null)}
        />
      )}

      <div className="cabinet">
        {items.length === 0 && (
          <p className="shelf-empty">The shelves are empty. Add something worth wanting.</p>
        )}
        {shelves.map((row, i) => (
          <div className="shelf" key={i}>
            <div className="shelf-items" style={{ '--per-shelf': perShelf }}>
              {row.map((item, j) => (
                <ShopItem
                  key={item.id}
                  item={item}
                  accent={itemAccent(item, i * perShelf + j)}
                  balance={balance ?? 0}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </div>
            <div className="plank" />
          </div>
        ))}
      </div>

      {!editing && (
        <div className="row spread" style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Add item
          </button>
          {items.length > 0 && (
            <span className="longpress-hint">
              <Icon name="pencil" size={12} />
              <span className="hint-touch">hold an item to edit</span>
              <span className="hint-pointer">right-click an item to edit</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

function ShopItem({ item, accent, balance, onEdit }) {
  const soldOut = !!item.sold_out;
  const affordable = balance >= item.cost;
  const cls = soldOut ? ' soldout' : affordable ? '' : ' unaffordable';
  const { handlers, holding } = useLongPress(onEdit);

  async function buy(e) {
    const btn = e.currentTarget;
    try {
      const purchase = await purchaseItem(item);
      confettiBurst(btn); // a purchase is a meaningful moment (§8)
      // Spending is the one action here you can't repeat your way out of, so
      // it gets the same take-back as everything else. The refund is a new
      // positive ledger row, not a rubbed-out negative one.
      showToast(`Bought ${item.name}`, { undo: () => refundPurchase(purchase) });
    } catch {
      /* raced below zero — the button state will catch up */
    }
  }

  const price = (
    <>
      <Icon name="spark" size={13} />
      {item.cost}
    </>
  );

  return (
    <div
      className={`box longpress${holding ? ' holding' : ''}${cls}`}
      style={{
        '--box-accent': `var(--accent-${accent})`,
        '--box-accent-soft': `var(--accent-${accent}-soft)`,
        '--box-accent-ink': `var(--accent-${accent}-ink)`,
      }}
      {...handlers}
    >
      <div className="box-art">
        {item.image_url ? (
          <img src={item.image_url} alt="" loading="lazy" />
        ) : (
          <div className="box-gen">
            <Icon name="shop" size={34} />
          </div>
        )}

        {soldOut && <span className="box-sticker out">sold out</span>}

        {soldOut || !affordable ? (
          <span className="price-tag cant">{price}</span>
        ) : (
          <button
            className="price-tag"
            onClick={buy}
            /* The whole box is a long-press target; without this, holding the
               price tag would open the editor and then still fire the buy on
               release. */
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Buy ${item.name} for ${item.cost} points`}
          >
            {price}
          </button>
        )}

        {/* The span is what gets line-clamped — see the note in base.css. */}
        <div className="box-name">
          <span>{item.name}</span>
        </div>
      </div>

      {/* The per-box pencil used to live here. Twelve of them across three
          shelves was more edit affordance than shop — editing is a long-press
          on the box now, and the foot is just the note. */}
      <div className="box-foot">
        {/* One line only, and the shortfall outranks the note — the full note
            is a hold away in the edit sheet. The spark is load-bearing: "9
            more" on its own reads as nine more of the item. */}
        {!soldOut && !affordable ? (
          <div className="box-note short">
            <Icon name="spark" size={11} />
            {item.cost - balance} more
          </div>
        ) : (
          <div className="box-note" title={item.notes || undefined}>
            {item.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemForm({ item, items, close }) {
  const [name, setName] = useState(item?.name || '');
  const [cost, setCost] = useState(item?.cost ?? 20);
  const [notes, setNotes] = useState(item?.notes || '');
  const [imageUrl, setImageUrl] = useState(item?.image_url || '');
  const [soldOut, setSoldOut] = useState(!!item?.sold_out);

  const index = item ? items.findIndex((i) => i.id === item.id) : -1;
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 ? items[index + 1] : null;

  async function save() {
    if (!name.trim() || !(Number(cost) > 0)) return;
    const fields = {
      name: name.trim(),
      cost: Math.round(Number(cost)),
      notes: notes.trim() || null,
      image_url: imageUrl.trim() || null,
      sold_out: soldOut ? 1 : 0,
    };
    if (item) await updateShopItem(item.id, fields);
    else await addShopItem(fields);
    close();
  }

  return (
    <div className="sheet stack-sm" style={{ marginBottom: 'var(--space-4)' }}>
      <div className="row">
        <input className="grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          type="number"
          min="1"
          style={{ width: 90 }}
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </div>
      <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <input
        placeholder="Image URL (GIFs welcome)"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      <label className="row small">
        <input type="checkbox" checked={soldOut} onChange={(e) => setSoldOut(e.target.checked)} />
        Sold out (visible but unbuyable)
      </label>
      {item && (
        <div className="row">
          {/* Shelf position, since where a box sits on the shelves is half of
              what makes the store feel like a store. */}
          <span className="muted small grow">Shelf position</span>
          <button
            className="icon-btn"
            disabled={!prev}
            onClick={() => moveRow('shop_items', item, prev, true)}
            aria-label="Move earlier"
          >
            <Icon name="arrowUp" size={16} />
          </button>
          <button
            className="icon-btn"
            disabled={!next}
            onClick={() => moveRow('shop_items', item, next, false)}
            aria-label="Move later"
          >
            <Icon name="arrowDown" size={16} />
          </button>
        </div>
      )}
      <div className="row spread">
        {item ? (
          <button
            className="btn danger"
            onClick={async () => {
              await deleteShopItem(item.id);
              close();
              showToast(`Removed ${item.name} — past purchases keep their history`, {
                undo: () => restoreShopItem(item.id),
              });
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="row">
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
