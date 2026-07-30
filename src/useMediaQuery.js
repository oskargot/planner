import { useEffect, useState } from 'react';

/*
 * Layout decisions that CSS can't make alone.
 *
 * Almost everything responsive in this app is a media query in base.css, and
 * it should stay that way. This hook is for the handful of places where the
 * DOM itself has to differ between widths — the two-pane screens, where the
 * wide layout renders a detail pane that simply doesn't exist on a phone, and
 * the shelves, which have to know how many boxes are in a row because each row
 * draws its own plank.
 *
 * Rendering both trees and hiding one with CSS was the alternative; it means
 * two live subscriptions per row and two copies of every editor's state.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update(); // the width may have changed between first render and effect
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update); // older iOS Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, [query]);

  return matches;
}

// The one breakpoint that changes the shape of a page rather than its spacing:
// the rail appears, and the two-pane screens split. Kept as a constant so the
// JS and the CSS can't drift apart.
export const WIDE = '(min-width: 900px)';

export function useWide() {
  return useMediaQuery(WIDE);
}
