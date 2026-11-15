import { HatchSwatch } from "./HatchSwatch";
import type { Unit } from "../types";
import { formatBound, formatTick, formatValue } from "./formatValue";
import type { ColorScale } from "./makeColorScale";

// Per-100k and years ranges would wrap to several lines per swatch with the unit repeated on
// both bounds, so those state it once under the ramp. Dollars and counts use compact bounds.
const UNIT_NOTE: Partial<Record<Unit, string>> = { years: "Years", rate_per_100k: "Per 100k" };

function formatLegendBound(v: number, unit: Unit): string {
  if (unit === "dollars" || unit === "count") return formatTick(v, unit);
  if (unit === "percent") return formatValue(v, unit);
  return formatBound(v, unit);
}

type Props = { scale: ColorScale; unit: Unit };

export function Legend({ scale, unit }: Props) {
  const { bins, ends } = scale;
  return (
    <div className="legend">
      <div className="legend-scale">
        {ends && (
          <div className="legend-ends">
            <span className="legend-end" data-end="low">
              {ends.low}
            </span>
            <span className="legend-end" data-end="high">
              {ends.high}
            </span>
          </div>
        )}
        <ul className="legend-bins" data-testid="legend-ramp">
          {bins.map((b) => (
            <li key={b.color}>
              <span className="legend-swatch" style={{ background: b.color }} aria-hidden="true" />
              <span className="legend-range">
                {formatLegendBound(b.min, unit)} – {formatLegendBound(b.max, unit)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="legend-null">
        <HatchSwatch />
        <span>{formatValue(null, unit)}</span>
        {UNIT_NOTE[unit] && <span className="legend-unit">{UNIT_NOTE[unit]}</span>}
      </div>
    </div>
  );
}
