import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { useBalance } from '../db/selectors.js';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';

/*
 * The Shop dashboard (design.md §1). The Store card reads the shelf against
 * the balance — what's within reach right now is the fact you actually come
 * here for — and Inventory is what's been bought and not yet collected.
 * Buying stays on the Store page: the card shows, the page acts.
 */
export default function ShopDash() {
  return (
    <>
      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-5)' }} />
        Shop
      </h1>
      <div className="dash-grid">
        <div className="dash-col">
          <StoreCard />
        </div>
        <div className="dash-col">
          <InventoryCard />
        </div>
      </div>
    </>
  );
}

function StoreCard() {
  const balance = useBalance();
  const items = useLiveQuery(
    () => db.shop_items.filter((i) => !i.deleted && !i.sold_out).sortBy('sort_order'),
    [],
    []
  );
  const affordable = balance == null ? [] : items.filter((i) => i.cost <= balance);

  return (
    <Card title={`Store · ${items.length}`} accent={5} to="/shop/store">
      {items.length === 0 && <p className="empty">The shelves are bare.</p>}
      {items.length > 0 && (
        <>
          <p className="muted small" style={{ marginBottom: 'var(--space-2)' }}>
            {affordable.length
              ? `${affordable.length} within reach right now.`
              : 'Nothing within reach yet — keep earning.'}
          </p>
          <div className="stack-sm">
            {items.slice(0, 6).map((i) => (
              <div className="row" key={i.id}>
                <span className={`grow${i.cost <= (balance ?? 0) ? '' : ' muted'}`}>{i.name}</span>
                <span className="muted small">
                  <Icon name="spark" size={12} /> {i.cost}
                </span>
              </div>
            ))}
            {items.length > 6 && <p className="muted small">and {items.length - 6} more</p>}
          </div>
        </>
      )}
    </Card>
  );
}

function InventoryCard() {
  const unredeemed = useLiveQuery(
    () => db.purchases.filter((p) => !p.deleted && !p.redeemed_at).toArray(),
    [],
    []
  );

  return (
    <Card
      title={unredeemed.length ? `Inventory · ${unredeemed.length}` : 'Inventory'}
      accent={5}
      to="/shop/inventory"
    >
      {unredeemed.length === 0 && <p className="muted small">Nothing waiting to be collected.</p>}
      <div className="stack-sm">
        {unredeemed.map((p) => (
          <div className="row" key={p.id}>
            <Icon name="box" size={18} />
            <span className="grow">{p.name_snapshot}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
