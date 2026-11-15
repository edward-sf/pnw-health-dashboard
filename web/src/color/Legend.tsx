import { HatchSwatch } from "./HatchSwatch";
import type { Unit } from "../types";
import { formatValue } from "./formatValue";
import type { ColorScale } from "./makeColorScale";

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
                {formatValue(b.min, unit)} – {formatValue(b.max, unit)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="legend-null">
        <HatchSwatch />
        <span>{formatValue(null, unit)}</span>
      </div>
    </div>
  );
}
