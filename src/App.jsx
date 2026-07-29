import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { NAV, matchNav } from './config.js';
import { loadSettings } from './db/db.js';
import { startSync } from './db/sync.js';
import NavBar from './components/NavBar.jsx';
import SyncDot from './components/SyncDot.jsx';

import Home from './pages/Home.jsx';
import Tasks from './pages/Tasks.jsx';
import TasksDone from './pages/TasksDone.jsx';
import HabitsToday from './pages/HabitsToday.jsx';
import HabitsMonth from './pages/HabitsMonth.jsx';
import Studio from './pages/Studio.jsx';
import StudioArchived from './pages/StudioArchived.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import ShopStore from './pages/ShopStore.jsx';
import ShopInventory from './pages/ShopInventory.jsx';
import ShopLedger from './pages/ShopLedger.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      document.documentElement.dataset.theme = s.theme;
      document.documentElement.dataset.motion = s.motion ? 'on' : 'off';
      setReady(true);
      startSync();
    });
  }, []);

  // Directional slide between sections: left if moving to a later tab.
  const { section } = matchNav(location.pathname);
  const sectionIndex = NAV.indexOf(section);
  const prevIndex = useRef(sectionIndex);
  const dir = sectionIndex >= prevIndex.current ? 'left' : 'right';
  useEffect(() => {
    prevIndex.current = sectionIndex;
  }, [sectionIndex]);

  if (!ready) return null;

  return (
    <div className="app">
      <SyncDot />
      <main className="page" key={section.id} data-dir={dir}>
        <div className={`page-inner page-slide-${dir}`}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/done" element={<TasksDone />} />
            <Route path="/habits" element={<HabitsToday />} />
            <Route path="/habits/month" element={<HabitsMonth />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/studio/archived" element={<StudioArchived />} />
            <Route path="/studio/p/:id" element={<ProjectDetail />} />
            <Route path="/shop" element={<ShopStore />} />
            <Route path="/shop/inventory" element={<ShopInventory />} />
            <Route path="/shop/ledger" element={<ShopLedger />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
      </main>
      <NavBar />
    </div>
  );
}
