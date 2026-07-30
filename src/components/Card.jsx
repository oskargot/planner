import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

// Dashboard card with the consistent header pattern (§7): title + link into
// the section. Optional decorative sticker (§8).
//
// Decoration: every card carries a thin rainbow stripe across its top edge,
// and the header rule fades out of the section's own accent. Both are pure
// decoration — the accent dot still names the section on its own.
export default function Card({
  title,
  accent,
  to,
  linkLabel = 'open',
  sticker,
  className = '',
  children,
}) {
  const vars = accent
    ? {
        '--header-rule': `linear-gradient(90deg, var(--accent-${accent}), var(--accent-${accent}-soft) 65%, transparent)`,
      }
    : undefined;

  return (
    <section className={`card${className ? ` ${className}` : ''}`} style={vars}>
      {sticker && (
        <span className="card-sticker" aria-hidden="true">
          {sticker}
        </span>
      )}
      <header className="card-header">
        <h2 className="card-title">
          {accent && (
            <span
              className="accent-dot"
              style={{ background: `var(--accent-${accent})` }}
            />
          )}
          {title}
        </h2>
        {to && (
          <Link className="card-link" to={to}>
            {linkLabel}
            <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
