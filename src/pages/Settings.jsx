import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMeta, setMeta } from '../db/db.js';
import { setRolloverHourCache } from '../db/time.js';
import { exportJSON } from '../db/backup.js';
import { ImportButton } from './ShopLedger.jsx';
import { syncNow, useSyncStatus } from '../db/sync.js';
import { THEMES, applyTheme, resolveTheme } from '../theme.js';
import Icon from '../components/Icon.jsx';

export default function Settings() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.themePref || 'auto'
  );
  const [motion, setMotion] = useState(document.documentElement.dataset.motion !== 'off');
  const [rollover, setRollover] = useState(4);
  const status = useSyncStatus();

  useEffect(() => {
    getMeta('day_rollover_hour', '4').then((v) => setRollover(Number(v)));
  }, []);

  function chooseTheme(id) {
    setTheme(id);
    applyTheme(id); // resolves 'auto' and updates the status-bar color
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
          <div className="row wrap">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`btn${theme === t.id ? ' primary' : ''}`}
                onClick={() => chooseTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            {theme === 'auto'
              ? `Following the system — currently ${resolveTheme('auto')}. It flips on its own, so a late night doesn't start with a white screen.`
              : THEMES.find((t) => t.id === theme)?.blurb}
          </p>
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

        {/* The ledger used to be the shop's third tab, in the way every time
            you went shopping. It's an audit log — it belongs with the other
            things you look at once a month. */}
        <div className="sheet field">
          <label>Points ledger</label>
          <div className="row wrap">
            <Link className="btn" to="/settings/ledger">
              <Icon name="sliders" size={15} /> Open the ledger
            </Link>
          </div>
          <p className="muted small">
            Every point ever earned or spent, newest first — and the only place
            to adjust the balance by hand.
          </p>
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

        {/* Only shown where there's a keyboard to use them with. */}
        <div className="sheet field shortcuts-card">
          <label>Keyboard</label>
          <div className="shortcuts">
            <Shortcut keys="⌘K" what="Search anything, jump anywhere" />
            <Shortcut keys="/" what="Same, when you're not typing" />
            <Shortcut keys="1–6" what="Go to a section" />
            <Shortcut keys="n" what="New task" />
            <Shortcut keys="esc" what="Close the palette" />
            <Shortcut keys="right-click" what="Edit a task, habit, shop box or stone" />
          </div>
        </div>
      </div>
    </>
  );
}

function Shortcut({ keys, what }) {
  return (
    <div className="row">
      <kbd className="palette-kbd">{keys}</kbd>
      <span className="muted small grow">{what}</span>
    </div>
  );
}
