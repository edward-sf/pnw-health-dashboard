import { HatchSwatch } from "../color/HatchSwatch";
import { usePalette } from "../color/palette";
import type { Flag } from "../types";
import { type Direction, TIERS, tierFill, tierLabel } from "./modelView";

export function ModelLegend({
  counts,
  direction,
}: {
  counts: Record<Flag, number>;
  direction: Direction;
}) {
  const palette = usePalette();
  return (
    <div className="legend legend-model">
      <ol className="legend-bins">
        {TIERS.map((flag) => (
          <li key={flag}>
            <span
              className="legend-swatch"
              style={{ background: tierFill(flag, palette) }}
              aria-hidden="true"
            />
            <span>
              {tierLabel(flag, direction).replace(" than expected", "")} ({counts[flag]})
            </span>
          </li>
        ))}
        <li>
          <HatchSwatch />
          <span>
            {tierLabel("insufficient_data", direction)} ({counts.insufficient_data})
          </span>
        </li>
      </ol>
      <p className="legend-note">Blue: more favorable than expected. Red: less favorable.</p>
      <p className="legend-note">
        Compared with what the model expects for counties nationwide with a similar social and
        economic profile.
      </p>
    </div>
  );
}
