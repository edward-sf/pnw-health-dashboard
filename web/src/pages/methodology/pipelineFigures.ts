import type { AppData } from "../../data/loadData";
import { defaultTargetId, targetModel } from "../../model/targetView";

export type PipelineFigures = {
  sources: number;
  counties: number;
  pnwR2: number;
  outcomes: number;
};

/** The hero's figures. The R² is the default outcome's LightGBM Pacific Northwest one. */
export function pipelineFigures(data: AppData): PipelineFigures {
  const targetIds = Object.keys(data.model.targets);
  const counties = data.topology.objects.counties.geometries.filter(
    (g) => g.properties && "fips" in g.properties,
  ).length;
  return {
    sources: new Set(data.manifest.sources.map((s) => s.source)).size,
    counties,
    pnwR2: targetModel(data.model, defaultTargetId(targetIds)).metrics.lightgbm.pnw.r2,
    outcomes: targetIds.length,
  };
}
