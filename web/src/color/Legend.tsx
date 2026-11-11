import type { Unit } from "../types";
import { formatValue } from "./formatValue";
import type { ColorScale } from "./makeColorScale";

type Props = { scale: ColorScale; unit: Unit };

export function Legend({ scale, unit }: Props) {
  const { bins, ends } = scale;
  return (
    <div className="legend">
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
        <li>
          <svg className="legend-swatch" width="16" height="16" aria-hidden="true">
            <defs>
              <pattern
                id="hatch-legend"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="4" height="4" fill="#f2f2f2" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="#999" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect width="16" height="16" fill="url(#hatch-legend)" />
          </svg>
          <span>{formatValue(null, unit)}</span>
        </li>
      </ul>
      {ends && <span className="legend-end">{ends.high}</span>}
    </div>
  );
}
