import { Link } from 'react-router-dom';

// Dashboard card with the consistent header pattern (§7): title + link into
// the section. Optional decorative sticker (§8).
export default function Card({ title, accent, to, linkLabel = 'open →', sticker, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      {sticker && (
        <span className="card-sticker" aria-hidden="true">
          {sticker}
        </span>
      )}
      <header
        className="card-header"
        style={accent ? { borderBottom: `2px solid var(--accent-${accent}-soft)` } : undefined}
      >
        <h2 className="card-title">
          {accent && (
            <span
              className="accent-dot"
              style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--radius-full)',
                background: `var(--accent-${accent})`,
                display: 'inline-block',
              }}
            />
          )}
          {title}
        </h2>
        {to && (
          <Link className="card-link" to={to}>
            {linkLabel}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
