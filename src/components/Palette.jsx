import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.js';
import { NAV, sectionPath } from '../config.js';
import { addTask, completeTask, uncompleteTask } from '../db/actions.js';
import { showToast } from '../toast.js';
import Icon from './Icon.jsx';

/*
 * ⌘K. The one screen in the app that isn't a screen.
 *
 * It exists because nothing else in Planner could answer "where did I put
 * that?" — with a few hundred rows across five tables, the only way to find a
 * task was to remember which list it was on. It doubles as the keyboard's way
 * around, which matters on the iPad where the trackpad is right there but the
 * nav is a column of icons at the far left.
 *
 * Everything it can do is something you could already do by hand; it never
 * becomes the only path to anything. That's the rule that keeps it optional.
 */

const LIMIT_PER_GROUP = 5;

export default function Palette({ open, close }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Queries only run while it's open. A palette that keeps five live
  // subscriptions warm for a keystroke that may never come is a background
  // tax on every screen in the app.
  const tasks = useLiveQuery(
    () => (open ? db.tasks.filter((t) => !t.deleted).toArray() : []),
    [open],
    []
  );
  const habits = useLiveQuery(
    () => (open ? db.habits.filter((h) => !h.deleted).toArray() : []),
    [open],
    []
  );
  const projects = useLiveQuery(
    () => (open ? db.projects.filter((p) => !p.deleted).toArray() : []),
    [open],
    []
  );
  const items = useLiveQuery(
    () => (open ? db.shop_items.filter((i) => !i.deleted).toArray() : []),
    [open],
    []
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // A frame's delay: iPad Safari won't take focus on an element that was
    // display:none when the event fired, and it's the difference between
    // typing straight through and losing the first two letters.
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    const match = (s) => s && s.toLowerCase().includes(q);

    // Sections always come first and are always present: with an empty box
    // this is a nav menu, which is what most ⌘K presses actually want.
    for (const s of NAV) {
      if (!q || match(s.label)) {
        out.push({
          kind: 'Go to',
          id: `nav-${s.id}`,
          label: s.label,
          icon: s.icon,
          accent: s.accent,
          run: () => navigate(sectionPath(s)),
        });
      }
      for (const c of s.children ?? []) {
        if (q && match(`${s.label} ${c.label}`)) {
          out.push({
            kind: 'Go to',
            id: `nav-${s.id}-${c.id}`,
            label: `${s.label} · ${c.label}`,
            icon: s.icon,
            accent: s.accent,
            run: () => navigate(c.path),
          });
        }
      }
    }
    if (!q || match('settings')) {
      out.push({
        kind: 'Go to', id: 'nav-settings', label: 'Settings', icon: 'gear',
        run: () => navigate('/settings'),
      });
    }
    if (q && match('ledger')) {
      out.push({
        kind: 'Go to', id: 'nav-ledger', label: 'Ledger', icon: 'sliders',
        run: () => navigate('/settings/ledger'),
      });
    }

    if (!q) return out;

    const open_ = tasks.filter((t) => !t.done_at && match(t.title));
    for (const t of open_.slice(0, LIMIT_PER_GROUP)) {
      out.push({
        kind: 'Task', id: `task-${t.id}`, label: t.title, icon: 'tasks', accent: 2,
        hint: 'complete',
        run: async () => {
          await completeTask(t);
          showToast(`Completed “${t.title}”`, { undo: () => uncompleteTask(t) });
        },
      });
    }
    const done = tasks.filter((t) => t.done_at && match(t.title));
    for (const t of done.slice(0, LIMIT_PER_GROUP)) {
      out.push({
        kind: 'Done', id: `donetask-${t.id}`, label: t.title, icon: 'check', accent: 2,
        run: () => navigate('/tasks/done'),
      });
    }
    for (const h of habits.filter((h) => match(h.name)).slice(0, LIMIT_PER_GROUP)) {
      out.push({
        kind: 'Habit', id: `habit-${h.id}`, label: `${h.emoji ? `${h.emoji} ` : ''}${h.name}`,
        icon: 'habits', accent: 3,
        run: () => navigate(h.active ? '/habits' : '/habits/archived'),
      });
    }
    for (const p of projects.filter((p) => match(p.name)).slice(0, LIMIT_PER_GROUP)) {
      out.push({
        kind: 'Project', id: `proj-${p.id}`, label: p.name, icon: 'studio', accent: 4,
        run: () => navigate(`/studio/p/${p.id}`),
      });
    }
    for (const i of items.filter((i) => match(i.name)).slice(0, LIMIT_PER_GROUP)) {
      out.push({
        kind: 'Shop', id: `item-${i.id}`, label: i.name, icon: 'shop', accent: 5,
        hint: `${i.cost}`,
        run: () => navigate('/shop'),
      });
    }

    // Last, never first: the palette should not turn a search that found
    // nothing into an accidental new task on Enter.
    out.push({
      kind: 'Create', id: 'new-task', label: `Add task “${query.trim()}”`, icon: 'plus', accent: 2,
      run: async () => {
        await addTask(query.trim(), 'M');
        showToast(`Added “${query.trim()}”`);
        navigate('/tasks');
      },
    });

    return out;
  }, [query, tasks, habits, projects, items, navigate]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  async function pick(r) {
    if (!r) return;
    close();
    await r.run();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[cursor]);
    }
  }

  // Group headings are drawn as the group changes rather than by bucketing the
  // list, so the cursor can walk one flat array and the arrow keys never have
  // to know groups exist.
  let lastKind = null;

  return (
    <div className="palette-backdrop" onPointerDown={close}>
      <div
        className="palette"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="palette-field">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="grow"
            placeholder="Search, or jump to a page…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
          <kbd className="palette-kbd">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <p className="empty">Nothing matches.</p>}
          {results.map((r, i) => {
            const heading = r.kind !== lastKind ? r.kind : null;
            lastKind = r.kind;
            return (
              <div key={r.id}>
                {heading && <div className="palette-group">{heading}</div>}
                <button
                  className={`palette-row${i === cursor ? ' active' : ''}`}
                  onPointerEnter={() => setCursor(i)}
                  onClick={() => pick(r)}
                >
                  <span
                    className="palette-icon"
                    style={r.accent ? { color: `var(--accent-${r.accent}-ink)` } : undefined}
                  >
                    <Icon name={r.icon} size={17} />
                  </span>
                  <span className="grow">{r.label}</span>
                  {r.hint && <span className="muted small">{r.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="palette-foot muted small">
          <span>↑↓ move · ⏎ pick · esc close</span>
          <span>1–6 sections · n new task</span>
        </div>
      </div>
    </div>
  );
}
