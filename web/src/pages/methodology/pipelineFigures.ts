import type { AppData } from "../../data/loadData";
import { defaultTargetId, targetModel } from "../../model/targetView";
import { stateNameForFips } from "./stateFipsNames";

export type PipelineFigures = {
  sources: number;
  counties: number;
  /** The states the counties are in, by name, alphabetically. */
  states: string[];
  pnwR2: number;
  outcomes: number;
};

/** The hero's figures, and the coverage the Geography section names. The R² is the default outcome's LightGBM Pacific Northwest one. */
export function pipelineFigures(data: AppData): PipelineFigures {
  const targetIds = Object.keys(data.model.targets);
  const fips = data.topology.objects.counties.geometries.flatMap((g) =>
    g.properties && "fips" in g.properties ? [g.properties.fips] : [],
  );
  return {
    sources: new Set(data.manifest.sources.map((s) => s.source)).size,
    counties: fips.length,
    states: [...new Set(fips.map(stateNameForFips))].sort(),
    pnwR2: targetModel(data.model, defaultTargetId(targetIds)).metrics.lightgbm.pnw.r2,
    outcomes: targetIds.length,
  };
}
