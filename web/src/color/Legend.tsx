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
        {ends && <span className="legend-end">{ends.low}</span>}
        <ul className="legend-bins">
          {bins.map((b) => (
            <li key={b.color}>
              <span className="legend-swatch" style={{ background: b.color }} aria-hidden="true" />
              <span>
                {formatValue(b.min, unit)} – {formatValue(b.max, unit)}
              </span>
            </li>
          ))}
        </ul>
        {ends && <span className="legend-end">{ends.high}</span>}
      </div>
      <div className="legend-null">
        <HatchSwatch />
        <span>{formatValue(null, unit)}</span>
      </div>
    </div>
  );
}
