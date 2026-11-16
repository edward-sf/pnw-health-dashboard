import { formatMetric } from "./format";

const pct = (r2: number) => `${Math.min(100, Math.max(0, r2 * 100))}%`;

/** Two bars comparing cross-validated R². The bars are decorative; the figures are in text. */
export function R2Comparison({
  national,
  pnw,
}: {
  national: number;
  pnw: number;
}) {
  const rows = [
    { label: "Nationally", value: national, className: "r2-bar--national" },
    { label: "Pacific Northwest", value: pnw, className: "r2-bar--pnw" },
  ];
  return (
    <figure className="r2-comparison">
      <figcaption>R² on counties the model didn't train on</figcaption>
      {rows.map((r) => (
        <div key={r.label} className="r2-row">
          <span className="r2-label">{r.label}</span>
          <span className="r2-track" aria-hidden="true">
            <span
              className={`r2-bar ${r.className}`}
              style={{ width: pct(r.value) }}
            />
          </span>
          <span className="r2-value">{formatMetric(r.value)}</span>
        </div>
      ))}
      {pnw < national && <p>The region fits less well than the country.</p>}
    </figure>
  );
}
