import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { adjustPoints } from '../db/actions.js';
import { useBalance } from '../db/selectors.js';
import { exportJSON, importJSON } from '../db/backup.js';
import Icon from '../components/Icon.jsx';

// Ledger rows name their source with the same glyph the nav uses for it.
const REASON_ICON = {
  task: 'tasks',
  habit: 'habits',
  chore: 'broom',
  project: 'studio',
  purchase: 'shop',
  adjust: 'sliders',
  // The one row type the rock economy can write. See awardDiscovery.
  discovery: 'gem',
};

export default function ShopLedger() {
  const balance = useBalance();
  const [showAdjust, setShowAdjust] = useState(false);
  const rows = useLiveQuery(
    async () => {
      const all = await db.ledger.filter((r) => !r.deleted).toArray();
      return all.sort((a, b) => b.created_at - a.created_at);
    },
    [],
    []
  );

  // Running balance, newest row first: start from the total and peel back.
  let running = balance ?? 0;
  const withRunning = rows.map((r) => {
    const line = { ...r, running };
    running -= r.delta;
    return line;
  });

  return (
    <>
      {/* No nav section owns this page any more, so it carries its own way
          back rather than relying on the bar to say where you are. */}
      <Link className="back-link" to="/settings">
        <Icon name="chevronLeft" size={14} /> Settings
      </Link>

      <h1 className="page-title">
        <span className="accent-dot" style={{ background: 'var(--accent-5)' }} />
        Ledger
        <span className="points-tally" style={{ marginLeft: 'auto' }}>
          <Icon name="spark" size={17} /> {balance ?? '…'}
        </span>
      </h1>

      <div className="row wrap" style={{ marginBottom: 'var(--space-4)' }}>
        <button className="btn" onClick={() => setShowAdjust(!showAdjust)}>
          Adjust points
        </button>
        <button className="btn" onClick={exportJSON}>
          Export JSON
        </button>
        <ImportButton />
      </div>

      {showAdjust && <AdjustForm close={() => setShowAdjust(false)} />}

      {withRunning.length === 0 && <p className="empty">No history yet. Go earn something.</p>}
      {withRunning.map((r) => (
        <div className="list-item" key={r.id} style={{ padding: 'var(--space-2) var(--space-3)' }}>
          <span className="ledger-reason" title={r.reason}>
            <Icon name={REASON_ICON[r.reason] || 'spark'} size={17} />
          </span>
          <div className="grow">
            <span className="small">{r.note || r.reason}</span>
            <div className="muted">{r.day}</div>
          </div>
          <span
            className="bold mono"
            style={{ color: r.delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {r.delta >= 0 ? `+${r.delta}` : r.delta}
          </span>
          <span className="muted mono" style={{ width: 44, textAlign: 'right' }}>
            {r.running}
          </span>
        </div>
      ))}
    </>
  );
}

function AdjustForm({ close }) {
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  async function submit(e) {
    e.preventDefault();
    const n = Math.round(Number(delta));
    if (!n || !note.trim()) return;
    await adjustPoints(n, note.trim());
    close();
  }

  return (
    <form className="sheet row wrap" style={{ marginBottom: 'var(--space-4)' }} onSubmit={submit}>
      <input
        type="number"
        style={{ width: 90 }}
        placeholder="±"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
      />
      <input
        className="grow"
        placeholder="Why? (required)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="btn primary" type="submit" disabled={!Number(delta) || !note.trim()}>
        Apply
      </button>
    </form>
  );
}

export function ImportButton() {
  return (
    <label className="btn" style={{ cursor: 'pointer' }}>
      Import JSON
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const applied = await importJSON(file);
            alert(`Import complete — ${applied} records merged.`);
          } catch (err) {
            alert(`Import failed: ${err.message}`);
          }
        }}
      />
    </label>
  );
}
