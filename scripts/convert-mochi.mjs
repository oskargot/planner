// One-shot converter: mochi house backup (v11) → planner-backup JSON that
// the app's Import button accepts.
//
//   TZ=America/Chicago node scripts/convert-mochi.mjs mochibackup.json out.json
//
// Mapping notes:
// - tasks + quests → tasks (tier → S/M/L; subtasks folded into notes)
// - habits → habits + habit_entries from hist (day strings zero-padded)
// - projects → projects + milestones + project_touches from session timestamps
// - shop → shop_items (photo data-URLs embedded; stock 0 → sold out)
// - vouchers → purchases (cost 0, redeemed if used)
// - log → ledger (habit/studio/task/quest/buy map to real reasons, the
//   minigames — garden, arcade, daily, … — become 'adjust' rows)
// - a final 'adjust' row reconciles the truncated log to the exported balance
// All updated_at are stamped at conversion time so the rows sync-push.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath = 'mochi-converted.json'] = process.argv;
if (!inPath) {
  console.error('usage: node scripts/convert-mochi.mjs <mochi-backup.json> [out.json]');
  process.exit(1);
}
const src = JSON.parse(readFileSync(inPath, 'utf8'));
if (src.v !== 11) console.warn(`warning: expected mochi v11, got v${src.v} — mapping may be off`);

const NOW = Date.now();
const ROLLOVER_H = 4;

const pad = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const fmtLocal = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const logicalDay = (ts) => fmtLocal(new Date(ts - ROLLOVER_H * 3600000));

const TIER = { small: 'S', medium: 'M', large: 'L', big: 'L' };

// old hex palette → nearest theme accent index (1 red … 6 violet)
function accentFromHex(hex) {
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return null;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return String(1); // red/pink
  if (h < 45) return String(2);  // orange
  if (h < 70) return String(3);  // yellow
  if (h < 170) return String(4); // green
  if (h < 260) return String(5); // blue
  return String(6);              // violet
}

const row = (id, ts, fields) => ({ id, created_at: ts ?? NOW, updated_at: NOW, deleted: 0, ...fields });
const out = { format: 'planner-backup', version: 1, exported_at: NOW, tables: {} };
const T = (name) => (out.tables[name] ??= []);

// ---- tasks (tasks + quests) ----
let order = 0;
for (const t of src.tasks ?? []) {
  const subs = (t.subs ?? [])
    .map((s) => `${s.done ? '✓' : '·'} ${s.text}`)
    .join('\n');
  T('tasks').push(
    row(t.id, null, {
      title: t.text,
      size: TIER[t.tier] ?? 'M',
      notes: subs || null,
      done_at: t.done ? src.lastBackup ?? NOW : null,
      sort_order: order++,
    })
  );
}
for (const q of src.quests ?? []) {
  T('tasks').push(
    row(q.id, null, {
      title: q.text,
      size: TIER[q.tier] ?? 'S',
      notes: null,
      done_at: null,
      sort_order: order++,
    })
  );
}

// ---- habits + entries ----
src.habits?.forEach((h, i) => {
  // Backdate creation to the first entry so the month map's
  // active-that-day ratio counts this habit across its real history.
  const firstEntry = (h.hist ?? [])
    .map((d) => new Date(`${pad(d)}T12:00:00`).getTime())
    .sort((a, b) => a - b)[0];
  T('habits').push(
    row(h.id, firstEntry ?? null, { name: h.text, emoji: null, active: 1, sort_order: i + 1 })
  );
  for (const d of h.hist ?? []) {
    const day = pad(d);
    T('habit_entries').push(
      row(`${h.id}-${day}`, new Date(`${day}T12:00:00`).getTime(), { habit_id: h.id, day })
    );
  }
});

// ---- projects, milestones, touches ----
src.projects?.forEach((p, i) => {
  const descBits = [p.notes, p.tag ? `#${p.tag}` : null].filter(Boolean);
  T('projects').push(
    row(p.id, p.ts, {
      name: p.name,
      description: descBits.join('\n') || null,
      color: accentFromHex(p.color),
      status: p.status === 'done' ? 'done' : p.status === 'paused' ? 'paused' : 'active',
      sort_order: i + 1,
    })
  );
  p.milestones?.forEach((m, j) => {
    T('milestones').push(
      row(m.id, p.ts, {
        project_id: p.id,
        title: m.text,
        done_at: m.done ? p.doneTs ?? src.lastBackup ?? NOW : null,
        sort_order: j + 1,
      })
    );
  });
  const days = new Set((p.sessions ?? []).map((ts) => logicalDay(ts)));
  for (const day of days) {
    T('project_touches').push(row(`${p.id}-${day}`, p.ts, { project_id: p.id, day }));
  }
});

// ---- shop ----
src.shop?.forEach((s, i) => {
  T('shop_items').push(
    row(s.id, null, {
      name: s.name,
      cost: s.cost,
      notes: null,
      image_url: (s.img && src.photos?.[s.img]) || null,
      sold_out: s.stock === 0 ? 1 : 0,
      sort_order: i + 1,
    })
  );
});

// ---- vouchers → purchases ----
for (const v of src.vouchers ?? []) {
  T('purchases').push(
    row(v.id, v.ts, {
      shop_item_id: null,
      name_snapshot: `${v.src} (${v.kind} voucher)`,
      cost_snapshot: 0,
      purchased_at: v.ts ?? NOW,
      redeemed_at: v.used ? v.ts ?? NOW : null,
    })
  );
}

// ---- log → ledger ----
const REASON = {
  habit: 'habit',
  studio: 'project',
  task: 'task',
  open: 'task',
  quest: 'task',
  buy: 'purchase',
  box: 'purchase',
};
let logSum = 0;
for (const l of src.log ?? []) {
  logSum += l.delta;
  T('ledger').push(
    row(l.id, l.ts, {
      delta: l.delta,
      reason: REASON[l.kind] ?? 'adjust',
      source_type: null,
      source_id: null,
      day: logicalDay(l.ts ?? NOW),
      note: l.text,
    })
  );
}

// Reconcile: the exported log is truncated, so force the final balance to
// match the exported points figure.
const target = src.points ?? 0;
if (target !== logSum) {
  T('ledger').push(
    row(`mochi-reconcile-${NOW}`, NOW, {
      delta: target - logSum,
      reason: 'adjust',
      source_type: null,
      source_id: null,
      day: logicalDay(NOW),
      note: `mochi house import — reconcile balance to ${target}`,
    })
  );
}

writeFileSync(outPath, JSON.stringify(out));
const counts = Object.fromEntries(Object.entries(out.tables).map(([k, v]) => [k, v.length]));
console.log('wrote', outPath, counts);
console.log(`balance after import: ${target} (log summed to ${logSum}, reconciled ${target - logSum >= 0 ? '+' : ''}${target - logSum})`);
