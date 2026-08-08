/*
 * The task gacha — mochi house's capsule machine, rebuilt. Feed it a task,
 * pull the crank, and it rolls what the task will be worth from GACHA_POOL.
 *
 * The roll is decided (and the task created) the moment you pull; the shake
 * and the capsule drop are pure reveal, so closing the tab mid-animation
 * loses nothing and the other device syncs the same worth. With motion off
 * the result simply appears — the machine still works, it just doesn't
 * perform. The economics live in actions.js next to SIZE_POINTS.
 */
import { useEffect, useRef, useState } from 'react';
import { addGachaTask, GACHA_POOL } from '../db/actions.js';
import { motionOff } from '../fx.js';
import Icon from './Icon.jsx';

// One capsule colour per pool entry, low roll → accent 1, jackpot → accent 6.
// Decorative: the number is always shown as text, so Mono loses nothing.
const capAccent = (points) => (GACHA_POOL.indexOf(points) % 6) + 1;

export default function Gacha() {
  const [title, setTitle] = useState('');
  // idle → rolling (capsules shake) → reveal (prize in the tray).
  const [phase, setPhase] = useState('idle');
  const [prize, setPrize] = useState(null); // { points, title }
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function pull(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || phase === 'rolling') return;
    const task = await addGachaTask(trimmed);
    setTitle('');
    clearTimeout(timer.current);
    const next = { points: task.gacha_points, title: trimmed };
    if (motionOff()) {
      setPrize(next);
      setPhase('reveal');
    } else {
      setPrize(next);
      setPhase('rolling');
      timer.current = setTimeout(() => setPhase('reveal'), 900);
    }
  }

  const revealed = phase === 'reveal' && prize;

  return (
    <div className="gacha">
      <div className={`gacha-machine${phase === 'rolling' ? ' rolling' : ''}`} aria-hidden="true">
        <div className="gacha-dome">
          {[1, 2, 3, 4, 5, 6].map((a, i) => (
            <span key={a} className={`gacha-cap cap-${i}`} style={{ '--cap': `var(--accent-${a})` }} />
          ))}
        </div>
        <div className="gacha-tray">
          {revealed && (
            <span
              key={`${prize.points}-${prize.title}`}
              className="gacha-prize"
              style={{
                '--cap': `var(--accent-${capAccent(prize.points)}-soft)`,
                color: `var(--accent-${capAccent(prize.points)}-ink)`,
              }}
            >
              {prize.points}
            </span>
          )}
        </div>
      </div>

      <form className="gacha-controls" onSubmit={pull}>
        <div className="gacha-heading">
          <Icon name="capsule" size={15} /> Task gacha
        </div>
        <div className="row">
          <input
            className="grow"
            placeholder="Feed it a task…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Task for the gacha"
          />
          <button className="btn primary" type="submit" disabled={!title.trim() || phase === 'rolling'}>
            {phase === 'rolling' ? 'Rolling…' : 'Pull'}
          </button>
        </div>
        {/* aria-live so the reveal is announced; the second line is real
            information (the roll and where it went), never encouragement. */}
        <p className="gacha-note" aria-live="polite">
          {revealed
            ? `Worth ${prize.points} ${prize.points === 1 ? 'point' : 'points'} — it's on the list.`
            : `Rolls a worth of ${GACHA_POOL.join(', ')} — decided when you pull, locked forever.`}
        </p>
      </form>
    </div>
  );
}
