import { contrastRatio } from "./contrast";
import { HATCH_FILL } from "./makeColorScale";

/** The county outline on pale fills, and the `.county` CSS fallback. */
export const DEFAULT_OUTLINE = "#808080";

// The background of the hatch pattern drawn for missing values (`HATCH_FILL`). Must match the
// background <rect> of the `hatch-null` pattern in CountyMap.
const HATCH_BACKGROUND = "#f2f2f2";
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The outline for a county with this fill, at least 3:1 against it (WCAG 1.4.11, M7 spec §3.1).
 * Pale fills keep the grey default; darker ones get black or white, whichever contrasts more.
 * The hatch fill is judged by its background; any other non-`#rrggbb` fill gets the default.
 */
export function outlineFor(fill: string): string {
  const base = fill === HATCH_FILL ? HATCH_BACKGROUND : fill;
  if (!HEX.test(base)) return DEFAULT_OUTLINE;
  if (contrastRatio(DEFAULT_OUTLINE, base) >= 3) return DEFAULT_OUTLINE;
  return contrastRatio("#000000", base) >= contrastRatio("#ffffff", base) ? "#000000" : "#ffffff";
}
