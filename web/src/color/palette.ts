import { useTheme } from "../theme/ThemeProvider";
import type { Theme } from "../theme/theme";

/**
 * The neutrals the map draws with that vary by theme. The data colors (the sequential ramps and
 * the four colored tiers) never do. `stage` must equal the `--stage` token in styles.css for the
 * same theme (tokens.test.ts checks it): county outlines are chosen against it.
 */
export type Palette = {
  /** The "about as expected" tier. */
  tierNone: string;
  /** The no-data hatch's background, on the map and in legend swatches. */
  hatchBackground: string;
  /** The no-data hatch's lines (texture, so not held to 3:1). */
  hatchLine: string;
  /** The map stage behind the counties. */
  stage: string;
};

export const PALETTES: Record<Theme, Palette> = {
  light: { tierNone: "#e3e3e3", hatchBackground: "#f2f2f2", hatchLine: "#999999", stage: "#ffffff" },
  dark: { tierNone: "#4b555a", hatchBackground: "#2a3236", hatchLine: "#6f7b80", stage: "#161d20" },
};

/** The active theme's palette; light outside a ThemeProvider. */
export function usePalette(): Palette {
  return PALETTES[useTheme().theme];
}
