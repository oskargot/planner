// Every mutation in the app lives here: the ledger rules (§5) are enforced
// in this module and nowhere else.

import { db, insertRow, updateRow, softDelete } from './db.js';
import { logicalDay } from './time.js';

export const SIZE_POINTS = { S: 3, M: 5, L: 8 };

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

export async function updateTask(id, fields) {
  await updateRow('tasks', id, fields);
}

export async function completeTask(task) {
  // Re-read so a double-tap can't award twice.
  const fresh = await db.tasks.get(task.id);
  if (!fresh || fresh.deleted || fresh.done_at) return;
  const pts = SIZE_POINTS[fresh.size] ?? 0;
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
    const pts = SIZE_POINTS[task.size] ?? 0;
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
