type Item = { label: string; value: number; display: string };

/** One bar per item, scaled against the largest value. The bars are decorative; the figures are in text. */
export function FactorBars({ items }: { items: Item[] }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <div className="factor-bars">
      {items.map((i) => (
        <div key={i.label} className="factor-row">
          <span className="factor-label">{i.label}</span>
          <span className="factor-track" aria-hidden="true">
            <span
              className="factor-bar"
              style={{ width: `${max > 0 ? (i.value / max) * 100 : 0}%` }}
            />
          </span>
          <span className="factor-value">{i.display}</span>
        </div>
      ))}
    </div>
  );
}
