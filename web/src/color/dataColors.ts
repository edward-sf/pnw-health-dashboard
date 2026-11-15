import { schemeBlues, schemeOrRd } from "d3-scale-chromatic";
import { TIER_FILLS } from "../model/modelView";
import { PALETTES } from "./palette";

/**
 * Every colour the map, legend and charts draw as data. Brand colours must stay visibly apart
 * from these (tokens.test.ts checks the distance). The no-data hatch fill is a pattern URL, so
 * only the hex values of the tier fills are listed.
 */
export const DATA_COLORS: readonly string[] = [
  ...(schemeOrRd[5] ?? []),
  ...(schemeBlues[5] ?? []),
  ...Object.values(TIER_FILLS).filter((c) => c.startsWith("#")),
  ...Object.values(PALETTES).flatMap((p) => [p.tierNone, p.hatchBackground, p.hatchLine]),
];
