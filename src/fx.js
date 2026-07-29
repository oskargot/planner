// Tiny DOM effects: floating points and confetti bursts (§8 "digital flair").
// All of it respects the motion toggle and prefers-reduced-motion.

function motionOff() {
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
