import { geoConicEqualArea, geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { CountiesTopology, CountyProperties } from "../types";
import { placePads, type Ring, type Shape } from "./placePads";

export type Extent = [[number, number], [number, number]];

export const MAP_LAYOUT: { width: 1280; height: 680; main: Extent; inset: Extent } = {
  width: 1280,
  height: 680,
  main: [
    [616, 16],
    [1264, 664],
  ],
  inset: [
    [16, 150],
    [560, 664],
  ],
};

/** `area` is the drawn area in square canvas units. `halo` is the width of an invisible stroke
 *  drawn under the counties for a scattered county (0: none). `pad` is an invisible square drawn
 *  over the counties so a county that would otherwise be hard to hit can be reached over the
 *  minimum size (null: none); pads are drawn in `layer` order, lowest first. */
export type MapPath = {
  fips: string;
  name: string;
  state: string;
  d: string;
  area: number;
  halo: number;
  pad: { rect: Extent; layer: number } | null;
};

type CountyFeature = Feature<Polygon | MultiPolygon, CountyProperties>;
type Counties = FeatureCollection<Polygon | MultiPolygon, CountyProperties>;

// Smallest comfortable hit size in canvas units: 24 CSS px whenever the map is drawn at least
// 1000px wide (scale 1000/1280), the exit criterion's floor at 1440×900.
export const MIN_HIT = 31;
const SPARSE_HALO = 16;
const SPARSE_FILL = 0.15;

/** The invisible stroke under a scattered county (islands), which only reaches the sea around
 *  them. A county short of the minimum gets a pad instead (`placePads`). */
export function haloWidth(bounds: Extent, area: number): number {
  const [[x0, y0], [x1, y1]] = bounds;
  const w = x1 - x0;
  const h = y1 - y0;
  if (Math.min(w, h) < MIN_HIT) return 0;
  return area / (w * h) < SPARSE_FILL ? SPARSE_HALO : 0;
}

function countiesOf(topology: CountiesTopology): Counties {
  return feature(topology, topology.objects.counties) as unknown as Counties;
}

function fit(
  features: CountyFeature[],
  extent: Extent,
  rotate: number,
  parallels: [number, number],
): GeoProjection {
  const collection: Counties = { type: "FeatureCollection", features };
  return geoConicEqualArea()
    .parallels(parallels)
    .rotate([rotate, 0])
    .fitExtent(extent, collection as GeoPermissibleObjects);
}

/** The projection the lower 48 are drawn with; the state borders must use the same one. */
export function lower48Projection(
  topology: CountiesTopology,
  layout: typeof MAP_LAYOUT = MAP_LAYOUT,
): GeoProjection {
  const features = countiesOf(topology).features.filter((f) => f.properties.state !== "AK");
  return fit(features, layout.main, 118, [43, 48]);
}

type Projected = Omit<MapPath, "pad"> & Shape;

function project(features: CountyFeature[], projection: GeoProjection): Projected[] {
  const path = geoPath(projection);
  return features.map((f) => {
    const area = path.area(f);
    const bounds = path.bounds(f) as Extent;
    return {
      fips: f.properties.fips,
      name: f.properties.name,
      state: f.properties.state,
      d: path(f) ?? "",
      area,
      bounds,
      rings: ringsOf(f, projection),
      halo: haloWidth(bounds, area),
    };
  });
}

/** The projected rings of a feature, in canvas units. */
function ringsOf(f: CountyFeature, projection: GeoProjection): Ring[] {
  const rings: Ring[] = [];
  let ring: Ring = [];
  geoPath(projection, {
    moveTo(x: number, y: number) {
      ring = [[x, y]];
      rings.push(ring);
    },
    lineTo(x: number, y: number) {
      ring.push([x, y]);
    },
    closePath() {},
    arc() {},
  } as unknown as CanvasRenderingContext2D)(f);
  return rings;
}

export function buildMapPaths(
  topology: CountiesTopology,
  layout: typeof MAP_LAYOUT = MAP_LAYOUT,
): MapPath[] {
  const { features } = countiesOf(topology);
  const alaska = features.filter((f) => f.properties.state === "AK");
  const lower48 = features.filter((f) => f.properties.state !== "AK");
  const projected = [
    ...(lower48.length ? project(lower48, lower48Projection(topology, layout)) : []),
    ...(alaska.length ? project(alaska, fit(alaska, layout.inset, 154, [55, 65])) : []),
  ];
  const pads = new Map(
    placePads(projected, layout.width, layout.height, MIN_HIT).map(({ index, pad }, layer) => [
      index,
      { rect: pad, layer },
    ]),
  );
  return projected.map(({ fips, name, state, d, area, halo }, i) => ({
    fips,
    name,
    state,
    d,
    area,
    halo,
    pad: pads.get(i) ?? null,
  }));
}
