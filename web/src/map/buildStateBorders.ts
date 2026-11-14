import { geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { mesh } from "topojson-client";
import type { CountiesTopology, CountyProperties } from "../types";
import { lower48Projection, MAP_LAYOUT } from "./buildMapPaths";

/** One SVG path of the lines where two lower-48 states meet. Alaska has no land neighbours. */
export function buildStateBorders(
  topology: CountiesTopology,
  layout: typeof MAP_LAYOUT = MAP_LAYOUT,
): string {
  const borders = mesh(
    topology,
    topology.objects.counties,
    (a, b) =>
      a !== b &&
      (a.properties as CountyProperties).state !== (b.properties as CountyProperties).state,
  );
  return geoPath(lower48Projection(topology, layout))(borders as GeoPermissibleObjects) ?? "";
}
