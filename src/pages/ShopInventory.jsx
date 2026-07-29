import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { redeemPurchase } from '../db/actions.js';
import { confettiBurst } from '../fx.js';
import { prettyDay, logicalDay } from '../db/time.js';

// The gap between paying for the blind box and opening it (§5.4).
export default function ShopInventory() {
  const purchases = useLiveQuery(
    async () => {
      const rows = await db.purchases.filter((p) => !p.deleted).toArray();
      return rows.sort((a, b) => b.purchased_at - a.purchased_at);
    },
    [],
    []
  );

  const unredeemed = purchases.filter((p) => !p.redeemed_at);
  const redeemed = purchases.filter((p) => p.redeemed_at).slice(0, 50);

  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-5)' }} />
        Inventory
      </h1>

      {unredeemed.length === 0 && <p className="empty">Nothing waiting to be opened.</p>}
      {unredeemed.map((p) => (
        <div className="list-item" key={p.id}>
          <span style={{ fontSize: 'var(--size-xl)' }}>📦</span>
          <div className="grow">
            <div className="item-title">{p.name_snapshot}</div>
            <div className="muted">
              ✦ {p.cost_snapshot} · {prettyDay(logicalDay(p.purchased_at))}
            </div>
          </div>
          <button
            className="btn primary"
            onClick={(e) => {
              confettiBurst(e.currentTarget);
              redeemPurchase(p.id);
            }}
          >
            Open it
          </button>
        </div>
      ))}

      {redeemed.length > 0 && (
        <>
          <h2 className="muted display" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
            History
          </h2>
          {redeemed.map((p) => (
            <div className="list-item" key={p.id} style={{ opacity: 0.7 }}>
              <span>🎉</span>
              <div className="grow">
                <span className="item-title">{p.name_snapshot}</span>
              </div>
              <span className="muted">{prettyDay(logicalDay(p.redeemed_at))}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
