import type { AppData } from "../../data/loadData";
import { DEFAULT_TARGET, targetModel } from "../../model/targetView";
import { featureLabel, formatCount, formatMetric, joinList, outcomeName } from "./format";
import { stateNameForFips } from "./stateFipsNames";

export function AtAGlance({ data }: { data: AppData }) {
  const { manifest, topology } = data;
  const model = targetModel(data.model, DEFAULT_TARGET);
  const fips = topology.objects.counties.geometries.flatMap((g) =>
    g.properties && "fips" in g.properties ? [g.properties.fips] : [],
  );
  const states = [...new Set(fips.map(stateNameForFips))].sort();
  const { national, pnw } = model.metrics.lightgbm;
  const top = [...model.global_importance]
    .sort((a, b) => b.mean_abs_shap - a.mean_abs_shap)
    .slice(0, 3)
    .map((e) => featureLabel(e.feature, manifest.indicators));
  const target = outcomeName(model.label);
  return (
    <section className="at-a-glance" aria-labelledby="at-a-glance">
      <h3 id="at-a-glance">At a glance</h3>
      <p>
        This dashboard covers {formatCount(fips.length)} counties in {joinList(states)}, with data
        from the CDC, the Census Bureau and County Health Rankings & Roadmaps.
      </p>
      <p>
        Its model predicts{" "}
        {joinList(Object.values(data.model.targets).map((t) => outcomeName(t.label)))} for each
        county. For {target}, the default, it uses {formatCount(model.model_card.features.length)}{" "}
        social and economic factors. Tested on counties it wasn't trained on, the model's R² is{" "}
        {formatMetric(pnw.r2)} for the Pacific Northwest and {formatMetric(national.r2)} nationally
        {pnw.r2 < national.r2
          ? ", so it fits the national pattern better than the Pacific Northwest's."
          : "."}{" "}
        The factors most associated with its expected values are {joinList(top)}.
      </p>
      <p>
        These are associations. They show what tends to go with higher or lower values, not what
        would change them.
      </p>
    </section>
  );
}
