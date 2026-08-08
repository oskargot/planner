// Every mutation in the app lives here: the ledger rules (§5) are enforced
// in this module and nowhere else.

import { db, insertRow, updateRow, softDelete } from './db.js';
import { logicalDay } from './time.js';
// Pure gem naming only — this reaches into tumbler/gems.js, never into
// db/tumbler.js, so the points side still can't touch grit.
import { SPECIES_BY_KEY, gemLabel } from '../tumbler/gems.js';

export const SIZE_POINTS = { S: 3, M: 5, L: 8 };

/*
 * The gacha pool. Mochi house's machine, rebuilt on planner rules: feed it a
 * task and it rolls what the task will be WORTH from these preset scores.
 * The mean is ~5.3 — a whisker over a Medium — so the gacha is a gamble, not
 * a raise: the 13 only exists because the 1 does. Rolling pays nothing; the
 * points land through completeTask like any other task, so pulling the crank
 * all day earns exactly as much as typing tasks all day.
 */
export const GACHA_POOL = [1, 2, 3, 5, 8, 13];

// What completing a task pays: the gacha roll if it has one, else its size.
export function taskPoints(task) {
  return task.gacha_points ?? SIZE_POINTS[task.size] ?? 0;
}

// ---- ledger ----

export async function addLedger({ delta, reason, sourceType = null, sourceId = null, day, note = null }) {
  return insertRow('ledger', {
    delta,
    reason,
    source_type: sourceType,
    source_id: sourceId,
    day: day ?? logicalDay(),
    note,
  });
}

export async function ledgerBalance() {
  let sum = 0;
  await db.ledger.each((r) => {
    if (!r.deleted) sum += r.delta;
  });
  return sum;
}

// Net points currently standing for a source record.
async function netForSource(sourceId) {
  let sum = 0;
  await db.ledger.each((r) => {
    if (!r.deleted && r.source_id === sourceId) sum += r.delta;
  });
  return sum;
}

// Undo = a second row with a negative delta (§5.2). Never edits the original.
async function reverseSource(sourceId, sourceType, reason, day, note = null) {
  const net = await netForSource(sourceId);
  if (net !== 0) {
    await addLedger({ delta: -net, reason, sourceType, sourceId, day, note });
  }
}

// ---- tasks ----

export async function addTask(title, size, notes = null, color = null) {
  const first = await db.tasks.orderBy('sort_order').first();
  return insertRow('tasks', {
    title,
    size,
    notes,
    color,
    done_at: null,
    sort_order: (first?.sort_order ?? 1) - 1,
  });
}

/*
 * A task from the gacha machine. The roll happens HERE, once, and is stored on
 * the row — the same rule that fixes a barrel's stone at load time: syncing
 * the task to another device shows the same worth, and there is no moment
 * where completing it re-rolls anything. The worth is locked from then on
 * (the editor shows a chip, not a size picker); rerolling by delete-and-retype
 * is possible and unguarded, the same way marking every task Large is possible
 * and unguarded — single user, honesty is the wall.
 *
 * `size` still gets a value — the nearest bucket — so the size filters and
 * groups keep meaning something. The exact worth is gacha_points.
 */
export async function addGachaTask(title) {
  const points = GACHA_POOL[Math.floor(Math.random() * GACHA_POOL.length)];
  const size = points <= 3 ? 'S' : points <= 5 ? 'M' : 'L';
  const first = await db.tasks.orderBy('sort_order').first();
  return insertRow('tasks', {
    title,
    size,
    gacha_points: points,
    notes: null,
    color: null,
    done_at: null,
    sort_order: (first?.sort_order ?? 1) - 1,
  });
}

export async function updateTask(id, fields) {
  await updateRow('tasks', id, fields);
}

export async function completeTask(task) {
  // Re-read so a double-tap can't award twice.
  const fresh = await db.tasks.get(task.id);
  if (!fresh || fresh.deleted || fresh.done_at) return;
  const pts = taskPoints(fresh);
  await updateRow('tasks', task.id, { done_at: Date.now() });
  await addLedger({ delta: pts, reason: 'task', sourceType: 'tasks', sourceId: task.id, day: logicalDay(), note: fresh.title });
}

export async function uncompleteTask(task) {
  const fresh = await db.tasks.get(task.id);
  if (!fresh || fresh.deleted || !fresh.done_at) return;
  await updateRow('tasks', task.id, { done_at: null });
  await reverseSource(task.id, 'tasks', 'task', logicalDay(), `undo: ${fresh.title}`);
}

export async function deleteTask(task) {
  // Deleting a completed task reverses its points (§5.2).
  if (task.done_at) {
    await reverseSource(task.id, 'tasks', 'task', logicalDay(), `deleted: ${task.title}`);
  }
  // Tombstone the children too, or they sync back as orphans that nothing
  // renders and nothing can ever reach to delete.
  const kids = await db.subtasks.where('task_id').equals(task.id).toArray();
  for (const k of kids) {
    if (!k.deleted) await softDelete('subtasks', k.id);
  }
  await softDelete('tasks', task.id);
}

/*
 * Undo for deleteTask, wired to the toast. Lifting the tombstone is the easy
 * half; the ledger is the half that matters. Deleting a *completed* task wrote
 * a negative row, so restoring it writes a positive one — a third row, not an
 * edit of either of the first two. History stays append-only and a restore
 * that syncs to the iPad lands as its own fact rather than as a contradiction.
 */
export async function restoreTask(task) {
  const kids = await db.subtasks.where('task_id').equals(task.id).toArray();
  for (const k of kids) {
    if (k.deleted) await updateRow('subtasks', k.id, { deleted: 0 });
  }
  await updateRow('tasks', task.id, { deleted: 0 });
  if (task.done_at) {
    const pts = taskPoints(task);
    if (pts) {
      await addLedger({
        delta: pts,
        reason: 'task',
        sourceType: 'tasks',
        sourceId: task.id,
        day: logicalDay(),
        note: `restored: ${task.title}`,
      });
    }
  }
}

// ---- subtasks ----
//
// Worth 0 points, exactly like milestones (§5.1). They're structure inside a
// task, and paying per subtask would make "one task, ten subtasks" the
// cheapest way to farm the ledger. Nothing in this section writes to `ledger`.

export async function addSubtask(taskId, title) {
  const rows = await db.subtasks.where('task_id').equals(taskId).toArray();
  const max = Math.max(0, ...rows.map((s) => s.sort_order));
  return insertRow('subtasks', {
    task_id: taskId,
    title,
    done_at: null,
    sort_order: max + 1,
  });
}

export async function toggleSubtask(sub) {
  await updateRow('subtasks', sub.id, { done_at: sub.done_at ? null : Date.now() });
}

export async function updateSubtask(id, fields) {
  await updateRow('subtasks', id, fields);
}

export async function deleteSubtask(id) {
  await softDelete('subtasks', id);
}

// ---- habits ----

export async function addHabit(name, emoji = null, color = null) {
  const last = await db.habits.orderBy('sort_order').last();
  return insertRow('habits', {
    name,
    emoji,
    color,
    active: 1,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
}

export async function updateHabit(id, fields) {
  await updateRow('habits', id, fields);
}

// Deleting a habit does NOT reverse historical points (§5.2) — which is also
// why restoring one is nothing but lifting the tombstone.
export async function deleteHabit(id) {
  await softDelete('habits', id);
}

export async function restoreHabit(id) {
  await updateRow('habits', id, { deleted: 0 });
}

export async function checkHabit(habitId, day) {
  // Revive a tombstoned entry rather than minting a new id, so the
  // (habit_id, day) unique index on the server never sees two live rows.
  const existing = await db.habit_entries.where('[habit_id+day]').equals([habitId, day]).first();
  if (existing) {
    if (!existing.deleted) return;
    await updateRow('habit_entries', existing.id, { deleted: 0 });
  } else {
    await insertRow('habit_entries', { habit_id: habitId, day });
  }
  await addLedger({ delta: 1, reason: 'habit', sourceType: 'habits', sourceId: habitId, day });
}

export async function uncheckHabit(habitId, day) {
  const existing = await db.habit_entries.where('[habit_id+day]').equals([habitId, day]).first();
  if (!existing || existing.deleted) return;
  await updateRow('habit_entries', existing.id, { deleted: 1 });
  await addLedger({ delta: -1, reason: 'habit', sourceType: 'habits', sourceId: habitId, day });
}

// ---- chores ----
//
// Recurring quest-like work — the middle ground between a task (done once)
// and a habit (done daily). The design rule that made these safe to add at
// all: a chore runs on a COOLDOWN, never a schedule. Doing it starts its
// rest; after interval_days it's simply ready again and waits forever, like
// a finished barrel does. Nothing here can be overdue, because "overdue" is
// the exact feeling the rest of the app is built to avoid.
//
// Completing one pays by size like a task (chores are real work, not
// structure), as its own ledger reason so Stats can show it as a source.

export async function addChore(name, { emoji = null, color = null, size = 'S', intervalDays = 7 } = {}) {
  const last = await db.chores.orderBy('sort_order').last();
  return insertRow('chores', {
    name,
    emoji,
    color,
    size,
    interval_days: intervalDays,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
}

export async function updateChore(id, fields) {
  await updateRow('chores', id, fields);
}

// Historical points stay, exactly like habits — which is also why restoring
// is nothing but lifting the tombstone.
export async function deleteChore(id) {
  await softDelete('chores', id);
}

export async function restoreChore(id) {
  await updateRow('chores', id, { deleted: 0 });
}

export async function checkChore(chore, day) {
  // Revive a tombstoned entry rather than minting a new id — same reason as
  // checkHabit: the (chore_id, day) unique index on the server must never see
  // two live rows.
  const existing = await db.chore_entries.where('[chore_id+day]').equals([chore.id, day]).first();
  if (existing) {
    if (!existing.deleted) return;
    await updateRow('chore_entries', existing.id, { deleted: 0 });
  } else {
    await insertRow('chore_entries', { chore_id: chore.id, day });
  }
  const pts = SIZE_POINTS[chore.size] ?? 0;
  if (pts) {
    await addLedger({ delta: pts, reason: 'chore', sourceType: 'chores', sourceId: chore.id, day, note: chore.name });
  }
}

export async function uncheckChore(chore, day) {
  const existing = await db.chore_entries.where('[chore_id+day]').equals([chore.id, day]).first();
  if (!existing || existing.deleted) return;
  await updateRow('chore_entries', existing.id, { deleted: 1 });
  // Reverse what that day actually paid rather than the chore's current size,
  // so editing the size between check and uncheck can't leak points.
  let net = 0;
  await db.ledger.each((r) => {
    if (!r.deleted && r.reason === 'chore' && r.source_id === chore.id && r.day === day) net += r.delta;
  });
  if (net) {
    await addLedger({ delta: -net, reason: 'chore', sourceType: 'chores', sourceId: chore.id, day, note: `undo: ${chore.name}` });
  }
}

// ---- projects ----

export async function addProject(name, color = null, description = null) {
  const last = await db.projects.orderBy('sort_order').last();
  return insertRow('projects', {
    name,
    description,
    color,
    status: 'active',
    sort_order: (last?.sort_order ?? 0) + 1,
  });
}

export async function updateProject(id, fields) {
  await updateRow('projects', id, fields);
}

export async function deleteProject(id) {
  // Historical touch points stay (§5.2).
  await softDelete('projects', id);
}

export async function restoreProject(id) {
  await updateRow('projects', id, { deleted: 0 });
}

export async function addMilestone(projectId, title) {
  const rows = await db.milestones.where('project_id').equals(projectId).toArray();
  const max = Math.max(0, ...rows.map((m) => m.sort_order));
  return insertRow('milestones', { project_id: projectId, title, done_at: null, sort_order: max + 1 });
}

// Milestones are structure, not points (§5.1) — no ledger writes here.
export async function toggleMilestone(m) {
  await updateRow('milestones', m.id, { done_at: m.done_at ? null : Date.now() });
}

export async function updateMilestone(id, fields) {
  await updateRow('milestones', id, fields);
}

export async function deleteMilestone(id) {
  await softDelete('milestones', id);
}

export async function touchProject(projectId, day) {
  const existing = await db.project_touches.where('[project_id+day]').equals([projectId, day]).first();
  if (existing) {
    if (!existing.deleted) return;
    await updateRow('project_touches', existing.id, { deleted: 0 });
  } else {
    await insertRow('project_touches', { project_id: projectId, day });
  }
  await addLedger({ delta: 1, reason: 'project', sourceType: 'projects', sourceId: projectId, day });
}

export async function untouchProject(projectId, day) {
  const existing = await db.project_touches.where('[project_id+day]').equals([projectId, day]).first();
  if (!existing || existing.deleted) return;
  await updateRow('project_touches', existing.id, { deleted: 1 });
  await addLedger({ delta: -1, reason: 'project', sourceType: 'projects', sourceId: projectId, day });
}

// ---- shop ----

export async function addShopItem(fields) {
  const last = await db.shop_items.orderBy('sort_order').last();
  return insertRow('shop_items', {
    name: fields.name,
    cost: Number(fields.cost),
    notes: fields.notes || null,
    image_url: fields.image_url || null,
    sold_out: fields.sold_out ? 1 : 0,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
}

export async function updateShopItem(id, fields) {
  await updateRow('shop_items', id, fields);
}

export async function deleteShopItem(id) {
  await softDelete('shop_items', id);
}

export async function restoreShopItem(id) {
  await updateRow('shop_items', id, { deleted: 0 });
}

// Purchases are blocked when cost > balance (§5.2). Balance may only go
// negative through 'adjust'.
export async function purchaseItem(item) {
  const balance = await ledgerBalance();
  if (item.cost > balance) throw new Error('Not enough points');
  const now = Date.now();
  const purchase = await insertRow('purchases', {
    shop_item_id: item.id,
    name_snapshot: item.name,
    cost_snapshot: item.cost,
    purchased_at: now,
    redeemed_at: null,
  });
  await addLedger({
    delta: -item.cost,
    reason: 'purchase',
    sourceType: 'purchases',
    sourceId: purchase.id,
    day: logicalDay(),
    note: item.name,
  });
  return purchase;
}

export async function redeemPurchase(id) {
  await updateRow('purchases', id, { redeemed_at: Date.now() });
}

/*
 * Undo for a purchase. The purchase row is tombstoned and the points come back
 * as a NEW positive row rather than by removing the negative one — a refund,
 * not an erasure. The ledger keeps saying what actually happened, which is the
 * whole reason it's append-only.
 */
export async function refundPurchase(purchase) {
  const fresh = await db.purchases.get(purchase.id);
  if (!fresh || fresh.deleted) return;
  await softDelete('purchases', purchase.id);
  await addLedger({
    delta: fresh.cost_snapshot,
    reason: 'purchase',
    sourceType: 'purchases',
    sourceId: fresh.id,
    day: logicalDay(),
    note: `refund: ${fresh.name_snapshot}`,
  });
}

export async function adjustPoints(delta, note) {
  return addLedger({ delta, reason: 'adjust', day: logicalDay(), note });
}

// ---- discoveries ----

/*
 * The one place the rock economy pays points, and the only breach in a wall
 * that is otherwise still absolute: no stone can be spent in the shop, no task
 * earns grit, and grit still buys nothing but rocks.
 *
 * What makes this breach safe is that it pays for DISCOVERIES, not for stones.
 * There are 45 squares in the collection and each one pays exactly once, ever.
 * So it can't be farmed, it can't be optimised, and — the thing that actually
 * mattered — you can't fall behind on it. The tumbler's whole design rests on
 * skipping it being free, and a bounty you can still collect in six months is
 * one you are never late for. A per-stone rate would have made not tumbling
 * cost you points, which is the version that turns the game into a chore.
 *
 * Scaled by grade because a Flawless is a genuine event, doubled for rare
 * species for the same reason.
 */
export const DISCOVERY_POINTS = [2, 3, 6, 12, 25];

export async function awardDiscovery(gem) {
  // The square, not the stone: two Clear Jades are one discovery.
  const key = `${gem.species}:${gem.grade}`;
  const paid = await db.ledger
    .filter((r) => !r.deleted && r.reason === 'discovery' && r.source_id === key)
    .first();
  // Idempotent against its own ledger row rather than against the gems table,
  // so re-minting a stone you already have pays nothing and a sync that brings
  // the other device's award across stops this one from paying twice. Two
  // devices discovering the same square while both offline would double-pay
  // once; that's a handful of points on a 45-square game, and the alternative
  // is a uniqueness constraint on an append-only table.
  if (paid) return 0;

  const species = SPECIES_BY_KEY[gem.species];
  const points = (DISCOVERY_POINTS[gem.grade] ?? 0) * (species?.rare ? 2 : 1);
  if (!points) return 0;

  await addLedger({
    delta: points,
    reason: 'discovery',
    sourceType: 'gems',
    sourceId: key,
    day: logicalDay(),
    note: `found a ${gemLabel(gem)}`,
  });
  return points;
}

// ---- ordering ----

/*
 * Move a row next to one of its neighbours by taking a fractional sort_order
 * on the far side of it. Same trick the milestone arrows have always used,
 * pulled out here because tasks, habits, projects and shop items all reorder
 * now.
 *
 * Fractions rather than renumbering the whole list: renumbering writes every
 * row, and every written row is a sync push and an LWW conflict waiting for
 * the other device. One move should touch exactly one row.
 */
export async function moveRow(table, row, neighbor, before) {
  if (!neighbor) return;
  await updateRow(table, row.id, {
    sort_order: neighbor.sort_order + (before ? -0.5 : 0.5),
  });
}
