import { useId } from "react";
import { HATCH_BACKGROUND } from "./makeColorScale";

/** The legend swatch for missing values, matching the map's hatch. Each has its own pattern id. */
export function HatchSwatch() {
  // Keep only word characters and hyphens: useId's punctuation (colons or «» in older React,
  // underscores now) has varied by version, and not all of it is safe in an SVG url(#…).
  const id = `hatch-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg className="legend-swatch" width="16" height="16" aria-hidden="true">
      <defs>
        <pattern
          id={id}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="4" height="4" fill={HATCH_BACKGROUND} />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#999" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="16" height="16" fill={`url(#${id})`} />
    </svg>
  );
}
