// Tiny DOM effects: floating points and confetti bursts (§8 "digital flair").
// All of it respects the motion toggle and prefers-reduced-motion.

export function motionOff() {
  return (
    document.documentElement.dataset.motion === 'off' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function pointFrom(target) {
  const rect = target?.getBoundingClientRect?.();
  if (!rect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: rect.left + rect.width / 2, y: rect.top };
}

export function floatPoints(target, delta) {
  if (motionOff() || !delta) return;
  const { x, y } = pointFrom(target);
  const el = document.createElement('div');
  el.className = 'float-points';
  el.textContent = delta > 0 ? `+${delta}` : `${delta}`;
  el.style.left = `${x}px`;
  el.style.top = `${y - 10}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// A rainbow ring that blooms out of wherever you touched. Global and
// document-level on purpose: it belongs to the whole app, not to any one
// control, and it must never depend on a component remembering to wire it up.
let ripplesLive = false;

export function initTapRipples() {
  if (ripplesLive) return;
  ripplesLive = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      // Right/middle click isn't a tap. Everything else — finger, pen,
      // left click — gets a ring.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (motionOff()) return;
      // Two thin rings rather than one thick one — the second chases the
      // first out, which reads far more like a real ripple than a single
      // expanding band. The delay is CSS; both are created here so they share
      // an origin exactly.
      const rings = ['tap-ripple lead', 'tap-ripple chase'].map((cls) => {
        const el = document.createElement('div');
        el.className = cls;
        el.style.left = `${e.clientX}px`;
        el.style.top = `${e.clientY}px`;
        document.body.appendChild(el);
        return el;
      });
      // Outlive the animation by a hair, then clean up. Nothing here holds a
      // reference, so a torn-down page just drops them.
      setTimeout(() => rings.forEach((el) => el.remove()), 800);
    },
    { passive: true }
  );
}

const ACCENTS = [1, 2, 3, 4, 5, 6];

export function confettiBurst(target, count = 24) {
  if (motionOff()) return;
  const { x, y } = pointFrom(target);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-bit';
    const accent = ACCENTS[i % ACCENTS.length];
    el.style.background = `var(--accent-${accent})`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--cx', `${(Math.random() - 0.5) * 220}px`);
    el.style.setProperty('--cy', `${40 + Math.random() * 140}px`);
    el.style.setProperty('--cr', `${180 + Math.random() * 360}deg`);
    el.style.animationDelay = `${Math.random() * 120}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
}
