import type { GeometryCollection, Topology } from "topojson-specification";

export type { Manifest, Indicator, Unit, Direction } from "./generated/manifest";
export type { ValuesFile, ValueEntry } from "./generated/values";
export type { ModelFile, CountyModel, Flag, ShapEntry } from "./generated/model";

export type CountyProperties = {
  fips: string;
  name: string;
  state: "WA" | "OR" | "ID" | "AK";
};

export type CountiesTopology = Topology<{
  counties: GeometryCollection<CountyProperties>;
}>;
