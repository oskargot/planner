import { useEffect, useState } from 'react';
import { subscribe, dismissToast, runUndo } from '../toast.js';
import Icon from './Icon.jsx';

/*
 * The toast rail. Mounted once in App, above everything, below nothing.
 *
 * Placement is deliberately different per width: on a phone it sits above the
 * bottom bar, because that's where the thumb already is and because covering
 * the nav would hide the way out. On the iPad it sits bottom-left, clear of
 * the rail — the far corner from where most actions happen, so an undo never
 * lands under the pointer that just clicked something else.
 */
export default function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribe(setItems), []);

  if (!items.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className={`toast${t.tone === 'danger' ? ' danger' : ''}`} key={t.id}>
          <span className="grow">{t.text}</span>
          {t.undo && (
            <button className="toast-undo" onClick={() => runUndo(t)}>
              <Icon name="undo" size={14} /> Undo
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
