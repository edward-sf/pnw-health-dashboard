import { geoConicEqualArea, geoPath } from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { CountiesTopology, CountyProperties } from "../types";

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

/** `halo` is a stroke width in canvas units; 0 means the county needs none. */
export type MapPath = { fips: string; name: string; state: string; d: string; halo: number };

type CountyFeature = Feature<Polygon | MultiPolygon, CountyProperties>;
type Counties = FeatureCollection<Polygon | MultiPolygon, CountyProperties>;

// Smallest comfortable hit size in canvas units: 24 CSS px once the map is drawn at 0.8 scale or
// more (1024px wide), which leaves room for a tall title block above a 1440×900 stage.
const MIN_HIT = 30;
const MIN_HALO = 12;
const SPARSE_HALO = 16;
const SPARSE_FILL = 0.15;

/** Extra invisible stroke width that makes a thin or scattered county easy to hit. */
export function haloWidth(bounds: Extent, area: number): number {
  const [[x0, y0], [x1, y1]] = bounds;
  const w = x1 - x0;
  const h = y1 - y0;
  const minSide = Math.min(w, h);
  if (minSide < MIN_HIT) return Math.max(MIN_HIT - minSide, MIN_HALO);
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

function project(features: CountyFeature[], projection: GeoProjection): MapPath[] {
  const path = geoPath(projection);
  return features.map((f) => ({
    fips: f.properties.fips,
    name: f.properties.name,
    state: f.properties.state,
    d: path(f) ?? "",
    halo: haloWidth(path.bounds(f) as Extent, path.area(f)),
  }));
}

export function buildMapPaths(
  topology: CountiesTopology,
  layout: typeof MAP_LAYOUT = MAP_LAYOUT,
): MapPath[] {
  const { features } = countiesOf(topology);
  const alaska = features.filter((f) => f.properties.state === "AK");
  const lower48 = features.filter((f) => f.properties.state !== "AK");
  return [
    ...(lower48.length ? project(lower48, lower48Projection(topology, layout)) : []),
    ...(alaska.length ? project(alaska, fit(alaska, layout.inset, 154, [55, 65])) : []),
  ];
}
