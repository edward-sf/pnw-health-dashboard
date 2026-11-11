import type { Flag } from "../types";
import { TIERS, tierFill, tierLabel } from "./modelView";

export function ModelLegend({ counts }: { counts: Record<Flag, number> }) {
  return (
    <div className="legend">
      <ul className="legend-bins">
        {TIERS.map((flag) => (
          <li key={flag}>
            <span
              className="legend-swatch"
              style={{ background: tierFill(flag) }}
              aria-hidden="true"
            />
            <span>
              {tierLabel(flag).replace(" than expected", "")} ({counts[flag]})
            </span>
          </li>
        ))}
        <li>
          <svg className="legend-swatch" width="16" height="16" aria-hidden="true">
            <defs>
              <pattern
                id="hatch-model-legend"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="4" height="4" fill="#f2f2f2" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="#999" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect width="16" height="16" fill="url(#hatch-model-legend)" />
          </svg>
          <span>
            {tierLabel("insufficient_data")} ({counts.insufficient_data})
          </span>
        </li>
      </ul>
      <p className="legend-note">
        Compared with what the model expects for counties nationwide with a similar social and
        economic profile.
      </p>
    </div>
  );
}
