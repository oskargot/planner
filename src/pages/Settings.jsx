import { useEffect, useState } from 'react';
import { getMeta, setMeta } from '../db/db.js';
import { setRolloverHourCache } from '../db/time.js';
import { exportJSON } from '../db/backup.js';
import { ImportButton } from './ShopLedger.jsx';
import { syncNow, useSyncStatus } from '../db/sync.js';

const THEMES = [
  { id: 'paper', label: 'Paper' },
  { id: 'mono', label: 'Mono' },
];

export default function Settings() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'paper');
  const [motion, setMotion] = useState(document.documentElement.dataset.motion !== 'off');
  const [rollover, setRollover] = useState(4);
  const status = useSyncStatus();

  useEffect(() => {
    getMeta('day_rollover_hour', '4').then((v) => setRollover(Number(v)));
  }, []);

  function applyTheme(id) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    setMeta('theme', id); // local-only meta
  }

  function applyMotion(on) {
    setMotion(on);
    document.documentElement.dataset.motion = on ? 'on' : 'off';
    setMeta('motion', on ? 'on' : 'off');
  }

  function applyRollover(h) {
    const n = Math.min(23, Math.max(0, Number(h) || 0));
    setRollover(n);
    setRolloverHourCache(n);
    setMeta('day_rollover_hour', n); // synced
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <div className="stack">
        <div className="sheet field">
          <label>Theme</label>
          <div className="row">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`btn${theme === t.id ? ' primary' : ''}`}
                onClick={() => applyTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet field">
          <label>Day rollover hour — a habit checked at 1am counts for yesterday</label>
          <div className="row">
            <input
              type="number"
              min="0"
              max="23"
              style={{ width: 80 }}
              value={rollover}
              onChange={(e) => applyRollover(e.target.value)}
            />
            <span className="muted">new day starts at {String(rollover).padStart(2, '0')}:00</span>
          </div>
        </div>

        <div className="sheet field">
          <label>Motion</label>
          <label className="row small">
            <input type="checkbox" checked={motion} onChange={(e) => applyMotion(e.target.checked)} />
            Confetti, floating points, transitions
          </label>
        </div>

        <div className="sheet field">
          <label>Backup</label>
          <div className="row wrap">
            <button className="btn" onClick={exportJSON}>
              Export JSON
            </button>
            <ImportButton />
          </div>
          <p className="muted small">
            Export works fully offline, straight from this device's data. Import merges
            (newest record wins), it never wipes.
          </p>
        </div>

        <div className="sheet field">
          <label>Sync</label>
          <div className="row">
            <button className="btn" onClick={syncNow}>
              Sync now
            </button>
            <span className="muted">{status}</span>
          </div>
        </div>
      </div>
    </>
  );
}
