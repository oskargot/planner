import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { NAV, matchNav, sectionPath } from './config.js';
import { loadSettings } from './db/db.js';
import { startSync } from './db/sync.js';
import { applyTheme } from './theme.js';
import NavBar from './components/NavBar.jsx';
import TopFrame from './components/TopFrame.jsx';
import Icon from './components/Icon.jsx';
import Toasts from './components/Toasts.jsx';
import Palette from './components/Palette.jsx';

import Home from './pages/Home.jsx';
import Stats from './pages/Stats.jsx';
import TasksDash from './pages/TasksDash.jsx';
import HabitsDash from './pages/HabitsDash.jsx';
import StudioDash from './pages/StudioDash.jsx';
import ShopDash from './pages/ShopDash.jsx';
import RocksDash from './pages/RocksDash.jsx';
import Tasks from './pages/Tasks.jsx';
import TasksDone from './pages/TasksDone.jsx';
import HabitsToday from './pages/HabitsToday.jsx';
import Chores from './pages/Chores.jsx';
import HabitsMonth from './pages/HabitsMonth.jsx';
import HabitsArchived from './pages/HabitsArchived.jsx';
import Studio from './pages/Studio.jsx';
import StudioArchived from './pages/StudioArchived.jsx';
import ShopStore from './pages/ShopStore.jsx';
import ShopInventory from './pages/ShopInventory.jsx';
import ShopLedger from './pages/ShopLedger.jsx';
import Tumbler from './pages/Tumbler.jsx';
import Mine from './pages/Mine.jsx';
import TumblerShelf from './pages/TumblerShelf.jsx';
import TumblerCollection from './pages/TumblerCollection.jsx';
import Settings from './pages/Settings.jsx';

const DEFAULT_SETTINGS = { theme: 'auto', motion: true };

export default function App() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    // Older iOS Safari can hang the first IndexedDB open after a cold start.
    // Never let that (or any DB failure) keep the app on a blank screen:
    // race a timeout, fall back to defaults, and say what happened.
    let settled = false;
    const finish = (s, err) => {
      if (settled) return;
      settled = true;
      applyTheme(s.theme);
      document.documentElement.dataset.motion = s.motion ? 'on' : 'off';
      if (err) setBootError(String(err?.message || err));
      setReady(true);
      startSync();
    };
    const timer = setTimeout(
      () => finish(DEFAULT_SETTINGS, 'Local database is slow to open — retrying in the background.'),
      4000
    );
    loadSettings()
      .then((s) => finish(s, null))
      .catch((e) => finish(DEFAULT_SETTINGS, e))
      .finally(() => clearTimeout(timer));
  }, []);

  useShortcuts({ openPalette: () => setPaletteOpen(true), enabled: ready });

  // Directional slide between sections: left if moving to a later tab.
  const { section } = matchNav(location.pathname);
  const sectionIndex = NAV.indexOf(section);
  const prevIndex = useRef(sectionIndex);
  const dir = sectionIndex >= prevIndex.current ? 'left' : 'right';
  useEffect(() => {
    prevIndex.current = sectionIndex;
  }, [sectionIndex]);

  // Visible placeholder — a broken boot must look broken, not blank.
  if (!ready) return <div className="empty">Loading…</div>;

  return (
    <div className="app">
      {bootError && (
        <div className="locked-note" role="alert">
          <Icon name="alert" size={16} /> {bootError}
        </div>
      )}
      {/* Outside <main> on purpose: the frame must not scroll with a list or
          slide with the section animation — it's the part that never moves
          (design.md §2). Hidden at ≥900px, where the rail is the frame. */}
      <TopFrame onSearch={() => setPaletteOpen(true)} />
      <main className="page" key={section.id} data-dir={dir}>
        <div className={`page-inner page-slide-${dir}`}>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Stats sat under Home for one release and put a sub-tab row on
                the landing screen. It lives with the ledger now. */}
            <Route path="/stats" element={<Navigate to="/settings/stats" replace />} />
            <Route path="/settings/stats" element={<Stats />} />
            {/* Section roots are dashboards (design.md §1); the pages that
                used to live there moved down one. Old bookmarks to a root
                land on the dashboard — graceful, so no redirects. */}
            <Route path="/tasks" element={<TasksDash />} />
            <Route path="/tasks/todo" element={<Tasks />} />
            <Route path="/tasks/done" element={<TasksDone />} />
            <Route path="/habits" element={<HabitsDash />} />
            <Route path="/habits/today" element={<HabitsToday />} />
            <Route path="/habits/month" element={<HabitsMonth />} />
            <Route path="/habits/archived" element={<HabitsArchived />} />
            {/* Chores moved under Habits — same kind of thing, two rhythms.
                The old top-level address still lands. */}
            <Route path="/habits/chores" element={<Chores />} />
            <Route path="/chores" element={<Navigate to="/habits/chores" replace />} />
            <Route path="/studio" element={<StudioDash />} />
            <Route path="/studio/active" element={<Studio />} />
            <Route path="/studio/archived" element={<StudioArchived />} />
            {/* Same component as /studio/active: on a phone it becomes the
                page, on a wide screen it selects into the pane beside the
                list. */}
            <Route path="/studio/p/:id" element={<Studio />} />
            <Route path="/shop" element={<ShopDash />} />
            <Route path="/shop/store" element={<ShopStore />} />
            <Route path="/shop/inventory" element={<ShopInventory />} />
            {/* The ledger lives under Settings now. Anything bookmarked or
                linked at the old address still lands on it. */}
            <Route path="/shop/ledger" element={<Navigate to="/settings/ledger" replace />} />
            <Route path="/settings/ledger" element={<ShopLedger />} />
            <Route path="/tumbler" element={<RocksDash />} />
            <Route path="/tumbler/barrels" element={<Tumbler />} />
            <Route path="/tumbler/mine" element={<Mine />} />
            <Route path="/tumbler/shelf" element={<TumblerShelf />} />
            <Route path="/tumbler/collection" element={<TumblerCollection />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
      </main>
      <NavBar onSearch={() => setPaletteOpen(true)} />
      <Palette open={paletteOpen} close={() => setPaletteOpen(false)} />
      <Toasts />
    </div>
  );
}

/*
 * Keyboard shortcuts. Oskar's iPad lives on a Magic Keyboard, so these aren't
 * a power-user extra — they're the primary input half the time.
 *
 * The guard that matters: a bare letter key must never fire while you're
 * typing. Everything unmodified is therefore ignored when focus is in a field,
 * which is why ⌘K exists alongside "/" — ⌘K still works mid-sentence in the
 * add-a-task box.
 */
function useShortcuts({ openPalette, enabled }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    function onKey(e) {
      const el = document.activeElement;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;

      if (e.key === '/') {
        e.preventDefault();
        openPalette();
        return;
      }
      // 1–6 walk the nav in the order it's drawn, which is the order the rail
      // shows — so the number is wherever your eye already is.
      const digit = Number(e.key);
      if (digit >= 1 && digit <= NAV.length) {
        e.preventDefault();
        navigate(sectionPath(NAV[digit - 1]));
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        // Straight to the To Do page, not the Tasks dashboard — the whole job
        // of this shortcut is putting the cursor in the add box, and the
        // dashboard doesn't have one. The timestamp is the point: navigating
        // to a page you're already on wouldn't re-run anything.
        navigate('/tasks/todo', { state: { focusAdd: Date.now() } });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette, enabled, navigate]);
}
