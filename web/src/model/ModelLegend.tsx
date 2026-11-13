import { HatchSwatch } from "../color/HatchSwatch";
import { usePalette } from "../color/palette";
import type { Flag } from "../types";
import { TIERS, tierFill, tierLabel } from "./modelView";

export function ModelLegend({ counts }: { counts: Record<Flag, number> }) {
  const palette = usePalette();
  return (
    <div className="legend">
      <ul className="legend-bins">
        {TIERS.map((flag) => (
          <li key={flag}>
            <span
              className="legend-swatch"
              style={{ background: tierFill(flag, palette) }}
              aria-hidden="true"
            />
            <span>
              {tierLabel(flag).replace(" than expected", "")} ({counts[flag]})
            </span>
          </li>
        ))}
        <li>
          <HatchSwatch />
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
