/*
 * Toasts, and the undo they carry.
 *
 * This replaced every confirm() in the app. A native dialog in a standalone
 * PWA looks like the browser breaking through the app, and it asks the
 * question at the worst possible moment — before you've seen what happens.
 * Doing the thing and offering to take it back is both quieter and more
 * honest: you find out by looking, not by reading a dialog.
 *
 * The rule for any undo handed to this module: it must be a NEW append-only
 * action, never an edit of history. Un-completing a task writes a second
 * ledger row; it does not delete the first. That's the same rule the rest of
 * db/actions.js follows, and it's why an undo that arrives after a sync still
 * lands correctly on the other device.
 *
 * A module-level store rather than context: toasts are fired from event
 * handlers deep inside pages, and threading a provider through every one of
 * them buys nothing when there is exactly one consumer.
 */

let items = [];
let nextId = 1;
const listeners = new Set();

// Long enough to notice and reach for, short enough that it isn't clutter.
const LIFETIME_MS = 6000;

function emit() {
  for (const fn of listeners) fn(items);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(items);
  return () => listeners.delete(fn);
}

export function dismissToast(id) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/*
 * `undo` is optional; without it this is just a status line. With it, the
 * toast carries the only affordance for taking the action back, so it stays
 * put until it times out or is used — never dismissed by navigation.
 */
export function showToast(text, { undo = null, tone = 'default' } = {}) {
  const id = nextId++;
  const toast = { id, text, undo, tone };
  // Newest first, and never more than three on screen: a stack that grows
  // without bound after a run of completions covers the thing you're doing.
  items = [toast, ...items].slice(0, 3);
  emit();
  setTimeout(() => dismissToast(id), LIFETIME_MS);
  return id;
}

export async function runUndo(toast) {
  dismissToast(toast.id);
  try {
    await toast.undo?.();
  } catch (err) {
    showToast(`Couldn't undo that — ${err.message}`, { tone: 'danger' });
  }
}
