import { useCallback, useEffect, useRef, useState } from 'react';

// Long-press to edit (§ interaction). Replaces the visible pencil buttons —
// the shop shelves in particular were more edit affordance than product.
//
// iOS is the hard part here, and all three of these are load-bearing:
//  - `touch-action: manipulation` + preventing `contextmenu` stops Safari's
//    own long-press menu (copy / share / "Add to Photos") from stealing it.
//  - A movement threshold cancels the press, so a long-press that turns into
//    a scroll flick doesn't open an editor under your thumb.
//  - `-webkit-user-select: none` on the target stops the text-selection
//    handles appearing mid-hold.
// The last two live in .longpress in base.css; the rest is here.
//
// Desktop gets right-click as an equal path — holding a mouse button down for
// half a second is nobody's instinct.

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10; // px of slop before we call it a scroll

export default function useLongPress(onLongPress, { disabled = false } = {}) {
  const timer = useRef(null);
  const origin = useRef(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
    setHolding(false);
  }, []);

  // A press in flight when the component unmounts (the editor it opens
  // replaces the row) would otherwise leave a live timer behind.
  useEffect(() => clear, [clear]);

  const start = useCallback(
    (e) => {
      if (disabled) return;
      // Ignore secondary buttons on the pointer path; contextmenu covers those.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      setHolding(true);
      timer.current = setTimeout(() => {
        fired.current = true;
        clear();
        // A real device buzz is the honest signal that the hold registered.
        // Not available on iOS Safari, hence the guard — the CSS press state
        // is the fallback everywhere else.
        navigator.vibrate?.(12);
        onLongPress();
      }, HOLD_MS);
    },
    [disabled, onLongPress, clear]
  );

  const move = useCallback(
    (e) => {
      if (!origin.current) return;
      const dx = Math.abs(e.clientX - origin.current.x);
      const dy = Math.abs(e.clientY - origin.current.y);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clear();
    },
    [clear]
  );

  const context = useCallback(
    (e) => {
      if (disabled) return;
      // Suppresses both the desktop menu and Safari's touch callout. On mouse
      // it doubles as the shortcut; on touch the timer has usually already
      // fired by the time this arrives, so guard against opening twice.
      e.preventDefault();
      if (!fired.current) {
        fired.current = true;
        clear();
        onLongPress();
      }
    },
    [disabled, onLongPress, clear]
  );

  return {
    // Spread onto the element that should respond to the hold.
    handlers: {
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: context,
    },
    // True while a hold is counting down — drives the CSS press-in state.
    holding,
    // True if the last gesture opened the editor. Read it in onClick to
    // suppress the tap that a completed long-press also produces.
    consumedRef: fired,
  };
}
