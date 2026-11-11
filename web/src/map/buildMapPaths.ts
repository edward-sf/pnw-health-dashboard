import { geoConicEqualArea, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { CountiesTopology, CountyProperties } from "../types";

export type Extent = [[number, number], [number, number]];

export const MAP_LAYOUT: { width: 960; height: 600; main: Extent; inset: Extent } = {
  width: 960,
  height: 600,
  main: [
    [352, 16],
    [944, 584],
  ],
  inset: [
    [16, 300],
    [336, 584],
  ],
};

export type MapPath = { fips: string; name: string; state: string; d: string };

type CountyFeature = Feature<Polygon | MultiPolygon, CountyProperties>;

function project(features: CountyFeature[], extent: Extent, rotate: number, parallels: [number, number]): MapPath[] {
  if (features.length === 0) return [];
  const collection: FeatureCollection<Polygon | MultiPolygon, CountyProperties> = {
    type: "FeatureCollection",
    features,
  };
  const projection = geoConicEqualArea()
    .parallels(parallels)
    .rotate([rotate, 0])
    .fitExtent(extent, collection as GeoPermissibleObjects);
  const path = geoPath(projection);
  return features.map((f) => ({
    fips: f.properties.fips,
    name: f.properties.name,
    state: f.properties.state,
    d: path(f) ?? "",
  }));
}

export function buildMapPaths(
  topology: CountiesTopology,
  layout: typeof MAP_LAYOUT = MAP_LAYOUT,
): MapPath[] {
  const { features } = feature(topology, topology.objects.counties) as unknown as FeatureCollection<
    Polygon | MultiPolygon,
    CountyProperties
  >;
  const alaska = features.filter((f) => f.properties.state === "AK");
  const lower48 = features.filter((f) => f.properties.state !== "AK");
  return [
    ...project(lower48, layout.main, 118, [43, 48]),
    ...project(alaska, layout.inset, 154, [55, 65]),
  ];
}
