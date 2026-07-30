import Icon from './Icon.jsx';

// Checkbox with overshoot pop. Accent is a rainbow index (1–6) or undefined
// for the semantic success color.
export default function Check({ on, onClick, accent, round = false, disabled = false, label }) {
  const style = accent ? { '--check-accent': `var(--accent-${accent})` } : undefined;
  return (
    <button
      type="button"
      className={`check${on ? ' on' : ''}${round ? ' round' : ''}`}
      style={style}
      onClick={onClick}
      disabled={disabled}
      role="checkbox"
      aria-checked={on}
      aria-label={label}
    >
      {on && <Icon name="check" size={16} strokeWidth={3} />}
    </button>
  );
}
