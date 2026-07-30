import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addShopItem, updateShopItem, deleteShopItem, purchaseItem } from '../db/actions.js';
import { useBalance } from '../db/selectors.js';
import { confettiBurst } from '../fx.js';
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
      <div className="awning">
        <span className="awning-title">
          <Icon name="shop" size={18} /> open
        </span>
      </div>

      {editing && (
        <ItemForm item={editing === 'new' ? null : editing} close={() => setEditing(null)} />
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
              <Icon name="pencil" size={12} /> hold an item to edit
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
      await purchaseItem(item);
      confettiBurst(btn); // a purchase is a meaningful moment (§8)
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
            is a hold away in the edit sheet. */}
        <div className="box-note" title={item.notes || undefined}>
          {!soldOut && !affordable ? `${item.cost - balance} more` : item.notes}
        </div>
      </div>
    </div>
  );
}

function ItemForm({ item, close }) {
  const [name, setName] = useState(item?.name || '');
  const [cost, setCost] = useState(item?.cost ?? 20);
  const [notes, setNotes] = useState(item?.notes || '');
  const [imageUrl, setImageUrl] = useState(item?.image_url || '');
  const [soldOut, setSoldOut] = useState(!!item?.sold_out);

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
      <div className="row spread">
        {item ? (
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`Delete "${item.name}"? Past purchases keep their history.`)) {
                deleteShopItem(item.id).then(close);
              }
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
