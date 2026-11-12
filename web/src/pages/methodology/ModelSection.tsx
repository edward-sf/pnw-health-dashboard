import { formatBound } from "../../color/formatValue";
import type { Indicator, TargetModel } from "../../types";
import { featureLabel, formatCount, formatMetric, joinList } from "./format";
import { MetricsTable } from "./MetricsTable";

const formatZ = (z: number) => z.toLocaleString("en-US", { maximumFractionDigits: 3 });

export function ModelSection({ model, indicators }: { model: TargetModel; indicators: Indicator[] }) {
  const card = model.model_card;
  const { sigma_model, z_75, z_90 } = model.thresholds;
  const label = (id: string) => featureLabel(id, indicators);
  const ranked = [...model.global_importance].sort((a, b) => b.mean_abs_shap - a.mean_abs_shap);
  return (
    <section aria-labelledby="model">
      <h3 id="model" tabIndex={-1}>
        The life expectancy model
      </h3>
      <dl className="methodology-dl">
        <dt>Target</dt>
        <dd>{label(card.target)}</dd>
        <dt>Factors</dt>
        <dd>{joinList(card.features.map(label))}</dd>
      </dl>
      <p>
        The model is trained on {formatCount(card.training_counties)} US counties: every county
        with a reported life expectancy and at least one factor. It's tested with{" "}
        {`${card.n_folds}-fold`} cross-validation grouped by state, so each county's expected value comes from a
        model that never saw any county in its state. A missing factor value is filled with the
        median from the counties used to train that model; the values shown on the site are
        never filled in.
      </p>
      <p>
        Two models are compared: a ridge regression baseline and LightGBM, a gradient-boosted tree
        model. The map and county panel use LightGBM. R² is the share of the variation in life
        expectancy between counties that the model accounts for (1 would be perfect). RMSE and MAE
        are typical prediction errors, in years.
      </p>
      <MetricsTable
        caption="Cross-validated accuracy"
        rows={[
          { model: "Ridge baseline", ...model.metrics.ridge },
          { model: "LightGBM", ...model.metrics.lightgbm },
        ]}
      />
      <h4 id="model-importance">Factors by importance</h4>
      <p>
        Each factor's average contribution to the expected values, in years, across all counties
        (mean absolute SHAP value).
      </p>
      <ol aria-labelledby="model-importance">
        {ranked.map((e) => (
          <li key={e.feature}>
            {label(e.feature)}: {formatMetric(e.mean_abs_shap)} years
          </li>
        ))}
      </ol>
      <h4>Better or worse than expected</h4>
      <p>
        A county's difference is its actual life expectancy minus the model's expected value. A
        positive difference means better than expected, and a negative one worse.
      </p>
      <p>
        Each county has its own range, z × √(σ_model² + se²). σ_model is the model's typical error
        once average measurement noise is taken out: {formatBound(sigma_model, "years")} years. se is
        the standard error of the county's life expectancy, from its published confidence interval;
        a county without an interval uses the average se² instead. A difference beyond the range
        with z = {formatZ(z_75)} (a two-sided 75% range) is flagged as somewhat better or worse than
        expected, and beyond the range with z = {formatZ(z_90)} (a two-sided 90% range) as notably
        better or worse.
      </p>
      <h4 id="no-result" tabIndex={-1}>
        Counties with no result
      </h4>
      <p>
        A county whose life expectancy isn't reported has no model result, because there is nothing
        to compare its expected value with. In model mode these counties are hatched and marked "Not
        enough data".
      </p>
      <h4>Factors that stand in for others</h4>
      <p>
        Some factors stand in for others the model doesn't see. For example, high housing costs
        often go with expensive metro areas and college towns, where lives tend to be longer, so a
        higher housing cost burden can raise the expected value. A factor's contribution shows what
        the model has learned goes with it, not what would happen if it changed.
      </p>
      <h4>Associations, not effects</h4>
      <p>
        The factors are associated with the expected value. They describe what the model expects
        for a county with that profile. They say nothing about why a county's actual life
        expectancy differs from its expected value, and they don't show that changing a factor
        would change life expectancy.
      </p>
    </section>
  );
}
