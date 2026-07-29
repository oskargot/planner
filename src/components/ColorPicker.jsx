// Rainbow accent swatches (1–6). null = "auto": the item takes a rotating
// rainbow color from its list position until a color is pinned.
export function itemAccent(row, index) {
  return row?.color ? Number(row.color) : (index % 6) + 1;
}

export default function ColorPicker({ value, onChange, allowAuto = true, size = 22 }) {
  return (
    <div className="row" style={{ gap: 'var(--space-1)' }} role="radiogroup" aria-label="Color">
      {allowAuto && (
        <button
          type="button"
          title="Auto (rainbow)"
          aria-label="Auto color"
          onClick={() => onChange(null)}
          className="swatch"
          style={{
            width: size,
            height: size,
            borderRadius: 'var(--radius-full)',
            background:
              'conic-gradient(var(--accent-1), var(--accent-2), var(--accent-3), var(--accent-4), var(--accent-5), var(--accent-6), var(--accent-1))',
            outline: value == null ? '2px solid var(--text-primary)' : 'none',
            outlineOffset: 2,
          }}
        />
      )}
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Accent ${n}`}
          onClick={() => onChange(String(n))}
          className="swatch"
          style={{
            width: size,
            height: size,
            borderRadius: 'var(--radius-full)',
            background: `var(--accent-${n})`,
            outline: String(n) === String(value) ? '2px solid var(--text-primary)' : 'none',
            outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );
}
