// Dev-only screenshot harness. Boots the built app in Chromium, seeds a
// realistic IndexedDB straight through the raw indexedDB API (Dexie's stores
// are plain object stores keyed on `id`), and shoots every screen at phone and
// iPad widths. Not shipped — nothing in src/ imports it.
//
//   npm run build && node scripts/shots.mjs [outdir]
//
// Screens are driven by URL rather than by clicking, so a broken nav can't
// silently take the whole run down with it.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'shots');
const DIST = resolve('dist');
const PORT = 5199;
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// SPA static server: anything without a file extension falls back to index.html.
const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  let file = join(DIST, url === '/' ? 'index.html' : url);
  try {
    if (!extname(url)) file = join(DIST, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const uid = (n) => `seed-${n}`;
const DAY_MS = 86400000;
const HOUR = 3600000;

// Local YYYY-MM-DD, matching logicalDay()'s 04:00 rollover.
function day(offset = 0) {
  const d = new Date(Date.now() - 4 * 3600000 + offset * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildSeed() {
  const now = Date.now();
  const base = { created_at: now - 40 * DAY_MS, updated_at: now, deleted: 0 };
  const tasks = [
    ['Email the framing shop about the print', 'M'],
    ['Replace the kitchen tap washer', 'S'],
    ['Draft the Heart & Cross vertical slice doc', 'L'],
    ['Book the dentist', 'S'],
    ['Sort the tape archive into boxes', 'M'],
    ['Return the library books', 'S'],
  ].map(([title, size], i) => ({ ...base, id: uid(`t${i}`), title, size, notes: null, color: null, done_at: null, sort_order: i }));

  // A couple of tasks carry a checklist, so the collapsed count chip and the
  // open drawer both have something to show.
  const subtasks = [
    [2, 'Outline the three acts', true],
    [2, 'Block out the prologue', true],
    [2, 'Write ADAM\u2019s first scene', false],
    [2, 'Pick the demo build target', false],
    [4, 'Buy archive boxes', true],
    [4, 'Label by year', false],
  ].map(([ti, title, done], i) => ({
    ...base, id: uid(`st${i}`), task_id: uid(`t${ti}`), title,
    done_at: done ? now - i * 3600000 : null, sort_order: i,
  }));

  const doneTasks = [
    ['Water everything', 'S'],
    ['Pay the internet bill', 'M'],
  ].map(([title, size], i) => ({ ...base, id: uid(`td${i}`), title, size, notes: null, color: null, done_at: now - i * 3600000, sort_order: 20 + i }));

  const habits = [
    ['Stretch', '🧘'], ['Read 20 pages', '📖'], ['Practice bass', '🎸'],
    ['Drink water', '💧'], ['Journal', '✏️'],
  ].map(([name, emoji], i) => ({ ...base, id: uid(`h${i}`), name, emoji, color: null, active: 1, sort_order: i }));

  // One retired habit, so the Archived screen has something to show. Its
  // entries stay in history and keep counting toward the days it was live.
  const archivedHabits = [
    { ...base, id: uid('ha0'), name: 'Duolingo', emoji: '🦉', color: null, active: 0, sort_order: 9 },
  ];

  // Habit history with a plausible shape: mostly-good recent days, patchier
  // further back, so the heat map has an actual gradient to look at.
  const habit_entries = [];
  const ledger = [];
  let led = 0;
  for (let back = 0; back < 34; back++) {
    const d = day(-back);
    const density = back < 7 ? 0.82 : back < 18 ? 0.55 : 0.3;
    habits.forEach((h, hi) => {
      // deterministic pseudo-random so runs are comparable
      const r = ((back * 7 + hi * 13) % 10) / 10;
      if (r < density) {
        habit_entries.push({ ...base, id: uid(`he${back}-${hi}`), habit_id: h.id, day: d });
        ledger.push({ ...base, id: uid(`l${led++}`), delta: 1, reason: 'habit', source_type: 'habits', source_id: h.id, day: d, note: null, created_at: now - back * DAY_MS });
      }
    });
  }

  // History for the retired habit, so Archived can show what it was worth.
  for (let back = 14; back < 30; back += 2) {
    habit_entries.push({
      ...base, id: uid(`hae${back}`), habit_id: archivedHabits[0].id, day: day(-back),
    });
    ledger.push({
      ...base, id: uid(`l${led++}`), delta: 1, reason: 'habit', source_type: 'habits',
      source_id: archivedHabits[0].id, day: day(-back), note: null,
      created_at: now - back * DAY_MS,
    });
  }

  const projects = [
    ['Heart & Cross', 'The cross-stitch game. Vertical slice by autumn.'],
    ['Tape archive', 'Digitising the shoebox of minidiscs.'],
    ['Balcony garden', null],
  ].map(([name, description], i) => ({ ...base, id: uid(`p${i}`), name, description, color: null, status: 'active', sort_order: i }));

  const milestones = [
    [0, 'Playable prologue', now - 5 * DAY_MS], [0, 'Button walk cycle', now - 12 * DAY_MS],
    [0, 'ADAM dialogue pass', null], [0, 'Ship the demo', null],
    [1, 'Buy the interface', now - 20 * DAY_MS], [1, 'Rip side A', null],
  ].map(([pi, title, done_at], i) => ({ ...base, id: uid(`m${i}`), project_id: projects[pi].id, title, done_at, sort_order: i }));

  const project_touches = [];
  [[0, 0], [0, 1], [0, 3], [1, 6], [2, 2]].forEach(([pi, back], i) => {
    const d = day(-back);
    project_touches.push({ ...base, id: uid(`pt${i}`), project_id: projects[pi].id, day: d });
    ledger.push({ ...base, id: uid(`l${led++}`), delta: 1, reason: 'project', source_type: 'projects', source_id: projects[pi].id, day: d, note: null, created_at: now - back * DAY_MS });
  });

  const shop_items = [
    ['New brush pen', 18], ['Takeaway night', 45], ['Record shop trip', 90],
    ['A whole afternoon off', 120], ['Cinema ticket', 60], ['Fancy coffee beans', 35],
    ['New houseplant', 40], ['Video game', 200],
  ].map(([name, cost], i) => ({ ...base, id: uid(`s${i}`), name, cost, notes: i === 2 ? 'only the good one' : null, image_url: null, sold_out: i === 7 ? 1 : 0, sort_order: i }));

  const purchases = [
    { ...base, id: uid('pu0'), shop_item_id: shop_items[0].id, name_snapshot: 'New brush pen', cost_snapshot: 18, purchased_at: now - 2 * DAY_MS, redeemed_at: null },
  ];
  ledger.push({ ...base, id: uid(`l${led++}`), delta: -18, reason: 'purchase', source_type: 'purchases', source_id: purchases[0].id, day: day(-2), note: 'New brush pen', created_at: now - 2 * DAY_MS });
  doneTasks.forEach((t, i) => {
    ledger.push({ ...base, id: uid(`l${led++}`), delta: t.size === 'M' ? 5 : 3, reason: 'task', source_type: 'tasks', source_id: t.id, day: day(0), note: t.title, created_at: now - i * 3600000 });
  });

  // ---- tumbler ----
  // species/grade are stored on the row rather than re-rolled, so these are
  // exactly the stones that show up. Seeds only drive the drawing.
  const gems = [
    ['amethyst', 4], ['opal', 3], ['jade', 2], ['rose', 1], ['aqua', 3],
    ['carn', 0], ['moon', 2], ['citrine', 3], ['obsidian', 4], ['jade', 1],
    ['rose', 3],
  ].map(([species, grade], i) => ({
    ...base, id: uid(`g${i}`), seed: `seed-gem-${i}`, species, grade,
    cycle_key: 'standard', created_at: now - i * 6 * 3600000,
  }));

  const tumbler_barrels = [
    { ...base, id: uid('b0'), slot: 0, cycle_key: 'overnight', seed: 'seed-b0', species: 'aqua', grade: 3, started_at: now - 4 * HOUR, duration_ms: 14 * HOUR, collected_at: null },
    { ...base, id: uid('b1'), slot: 1, cycle_key: 'standard', seed: 'seed-b1', species: 'opal', grade: 2, started_at: now - 9 * HOUR, duration_ms: 6 * HOUR, collected_at: null },
    { ...base, id: uid('b2'), slot: 2, cycle_key: null, seed: null, species: null, grade: null, started_at: null, duration_ms: 0, collected_at: now - 2 * HOUR },
  ];

  const tumbler_ledger = [
    ...[55, 24, 11, 11, 5, 22, 48, 5, 2].map((delta, i) => ({
      ...base, id: uid(`tl${i}`), delta, reason: 'crush', upgrade_key: null, note: null, created_at: now - i * 8 * 3600000,
    })),
    { ...base, id: uid('tlu0'), delta: -120, reason: 'upgrade', upgrade_key: 'barrels', note: 'Another barrel', created_at: now - 3 * DAY_MS },
    { ...base, id: uid('tlu1'), delta: -60, reason: 'upgrade', upgrade_key: 'speed', note: 'Better grit feed', created_at: now - 2 * DAY_MS },
  ];

  return {
    tasks: [...tasks, ...doneTasks], subtasks,
    habits: [...habits, ...archivedHabits], habit_entries, projects, milestones,
    project_touches, shop_items, purchases, ledger,
    gems, tumbler_barrels, tumbler_ledger,
  };
}

const SEED = buildSeed();

const SCREENS = [
  ['home', '/'], ['stats', '/stats'],
  ['tasks', '/tasks'], ['tasks-done', '/tasks/done'],
  ['habits', '/habits'], ['habits-month', '/habits/month'],
  ['habits-archived', '/habits/archived'],
  ['studio', '/studio'], ['studio-project', '/studio/p/seed-p0'],
  ['shop', '/shop'], ['shop-inventory', '/shop/inventory'],
  ['ledger', '/settings/ledger'], ['tumbler', '/tumbler'],
  ['tumbler-shelf', '/tumbler/shelf'], ['tumbler-collection', '/tumbler/collection'],
  ['settings', '/settings'],
];

// A sample in the dark theme too. Not every screen — the point is to catch a
// token that never got a dark value, and the screens with the most furniture
// (the shopfront, the shelves) are where that shows up first.
const DARK_SCREENS = [
  ['home', '/'], ['stats', '/stats'], ['tasks', '/tasks'],
  ['shop', '/shop'], ['tumbler-shelf', '/tumbler/shelf'],
];

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }, 3],
  ['ipad', { width: 1180, height: 820 }, 2],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [vpName, viewport, dsf] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile: vpName === 'phone', hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log(`  [console] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

  // Boot once so the app creates the Dexie stores, then fill them and reload.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(async (seed) => {
    const dbh = await new Promise((res, rej) => {
      const r = indexedDB.open('planner');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const names = Object.keys(seed).filter((n) => dbh.objectStoreNames.contains(n));
    await new Promise((res, rej) => {
      const tx = dbh.transaction(names, 'readwrite');
      for (const n of names) for (const row of seed[n]) tx.objectStore(n).put(row);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  }, SEED);

  for (const [name, path] of SCREENS) {
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `${vpName}-${name}.png`) });
  }

  // Two states that only exist after an interaction, so they can't be reached
  // by URL like everything else: the palette, and a toast with its undo.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('bass');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${vpName}-palette.png`) });
  await page.keyboard.press('Escape');

  // A task open: the detail pane on a wide screen, the subtask drawer on a
  // phone. Both are the same click, and neither is reachable by URL.
  await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('.list-item').nth(2).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${vpName}-tasks-open.png`) });

  await page.goto(`http://localhost:${PORT}/tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('.check').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${vpName}-toast.png`) });

  // Fusion, end to end. The seeded shelf has four grade-3 stones at these
  // positions when sorted newest-first; picking three of them is the only way
  // to see the bench, and clicking through to the reveal is the only way to
  // know the whole path actually mints a stone.
  await page.goto(`http://localhost:${PORT}/tumbler/shelf`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  for (const nth of [1, 4, 7]) await page.locator('.gem-slot').nth(nth).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${vpName}-fuse.png`) });
  await page.locator('.fuse-bar .btn.primary').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${vpName}-fuse-reveal.png`) });

  // Same device, lights off. The preference lives in meta (App re-applies it
  // on boot and would otherwise overwrite anything set here), and is mirrored
  // into localStorage the way theme.js does it — which is also the path that
  // stops a dark launch from flashing white.
  await page.evaluate(async () => {
    localStorage.setItem('theme-pref', 'dark');
    const dbh = await new Promise((res, rej) => {
      const r = indexedDB.open('planner');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = dbh.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').put({ key: 'theme', value: 'dark', updated_at: Date.now() });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  });
  for (const [name, path] of DARK_SCREENS) {
    await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `${vpName}-dark-${name}.png`) });
  }

  await ctx.close();
}

await browser.close();
server.close();
console.log(`shots written to ${OUT}`);
