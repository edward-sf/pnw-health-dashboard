import { contrastRatio, isHexColor } from "./contrast";
import { HATCH_FILL } from "./makeColorScale";
import type { Palette } from "./palette";

/** The county outline on pale fills, and the `.county` CSS fallback. */
export const DEFAULT_OUTLINE = "#808080";

/**
 * The outline for a county with this fill, at least 3:1 against it (WCAG 1.4.11, M7 spec §3.1).
 * Pale fills keep the grey default; darker ones get black or white, whichever contrasts more.
 * The hatch fill is judged by the palette's hatch background; any other non-`#rrggbb` fill gets
 * the default, with a warning in development.
 */
export function outlineFor(fill: string, palette: Palette): string {
  const base = fill === HATCH_FILL ? palette.hatchBackground : fill;
  if (!isHexColor(base)) {
    if (import.meta.env.DEV) console.warn(`outlineFor: can't parse fill "${fill}"; using the default outline`);
    return DEFAULT_OUTLINE;
  }
  if (contrastRatio(DEFAULT_OUTLINE, base) >= 3) return DEFAULT_OUTLINE;
  return contrastRatio("#000000", base) >= contrastRatio("#ffffff", base) ? "#000000" : "#ffffff";
}
