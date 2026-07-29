import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { addShopItem, updateShopItem, deleteShopItem, purchaseItem } from '../db/actions.js';
import { useBalance } from '../db/selectors.js';
import { confettiBurst } from '../fx.js';

export default function ShopStore() {
  const balance = useBalance();
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const items = useLiveQuery(
    () => db.shop_items.filter((i) => !i.deleted).sortBy('sort_order'),
    [],
    []
  );

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-5)' }} />
        Store
        <span
          className="display bold"
          style={{ marginLeft: 'auto', color: 'var(--color-points)' }}
        >
          ✦ {balance ?? '…'}
        </span>
      </h1>

      {editing && (
        <ItemForm item={editing === 'new' ? null : editing} close={() => setEditing(null)} />
      )}

      <div className="shop-grid">
        {items.map((item) => (
          <ShopItem key={item.id} item={item} balance={balance ?? 0} onEdit={() => setEditing(item)} />
        ))}
      </div>

      {items.length === 0 && (
        <p className="empty">The shelves are empty. Add something worth wanting.</p>
      )}

      {!editing && (
        <button className="btn" style={{ marginTop: 'var(--space-4)' }} onClick={() => setEditing('new')}>
          + Add item
        </button>
      )}
    </>
  );
}

function ShopItem({ item, balance, onEdit }) {
  const affordable = balance >= item.cost;
  const cls = item.sold_out ? 'soldout' : affordable ? '' : 'unaffordable';

  async function buy(e) {
    const btn = e.currentTarget;
    try {
      await purchaseItem(item);
      confettiBurst(btn); // a purchase is a meaningful moment (§8)
    } catch {
      /* raced below zero — the button state will catch up */
    }
  }

  return (
    <div className={`shop-item ${cls}`}>
      {item.image_url ? (
        <img src={item.image_url} alt="" loading="lazy" />
      ) : (
        <div className="placeholder">🎁</div>
      )}
      <div className="bold display">{item.name}</div>
      {item.notes && <div className="muted">{item.notes}</div>}
      <div className="display" style={{ color: 'var(--color-points)' }}>✦ {item.cost}</div>
      {item.sold_out ? (
        <span className="badge">sold out</span>
      ) : affordable ? (
        <button className="btn primary" onClick={buy}>
          Buy
        </button>
      ) : (
        <span className="badge warn">{item.cost - balance} more</span>
      )}
      <button className="icon-btn" onClick={onEdit}>
        edit
      </button>
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
