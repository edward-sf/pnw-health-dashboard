import { NativeSelect } from "@/components/ui/native-select";
import { formatValue } from "../../color/formatValue";
import { modelDigits } from "../../model/modelView";
import { defaultTargetId, targetModel } from "../../model/targetView";
import type { Indicator, ModelFile } from "../../types";
import { featureLabel, formatCount, joinList, outcomeCell, outcomeName } from "./format";
import { MetricsTable } from "./MetricsTable";

const formatZ = (z: number) => z.toLocaleString("en-US", { maximumFractionDigits: 3 });

type Props = {
  model: ModelFile;
  targetId: string;
  onTargetChange: (id: string) => void;
  indicators: Indicator[];
};

export function ModelSection({ model: file, targetId, onTargetChange, indicators }: Props) {
  const model = targetModel(file, targetId);
  const targets = Object.entries(file.targets);
  const names = (direction: string) =>
    joinList(
      targets.filter(([, t]) => t.direction === direction).map(([, t]) => outcomeName(t.label)),
    );
  const better = names("higher_is_better");
  const worse = names("higher_is_worse");
  const defaultTarget = targetModel(file, defaultTargetId(Object.keys(file.targets)));
  const outcome = outcomeName(model.label);
  const card = model.model_card;
  const { sigma_model, z_75, z_90 } = model.thresholds;
  const label = (id: string) => featureLabel(id, indicators);
  const ranked = [...model.global_importance].sort((a, b) => b.mean_abs_shap - a.mean_abs_shap);
  return (
    <section aria-labelledby="model">
      <h3 id="model" tabIndex={-1}>
        The model
      </h3>
      <p>
        The same model is built for each of {targets.length} outcomes, from the same factors:{" "}
        {joinList(targets.map(([, t]) => outcomeName(t.label)))}. The default is{" "}
        {outcomeName(defaultTarget.label)}. They all come from County Health Rankings & Roadmaps,
        and each is published with a confidence interval for most counties.
      </p>
      <p>
        CDC PLACES outcomes such as diabetes, COPD and depression are not targets. CDC builds them
        partly from American Community Survey demographics, so predicting them from the same kind of
        data would largely reproduce CDC's own model. Low birth weight was also left out. The
        model's expected values didn't fit Pacific Northwest counties: the region as a whole sat
        well below its national expectation, so the flags would have shown a regional offset, not
        differences between counties.
      </p>
      <label className="methodology-select">
        Outcome
        <NativeSelect value={targetId} onChange={(e) => onTargetChange(e.target.value)}>
          {targets.map(([id, t]) => (
            <option key={id} value={id}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <p>
        The details below, the factors by importance, and the details under Reproducibility are for
        the outcome selected here. The accuracy table covers every outcome.
      </p>
      <dl className="methodology-dl">
        <dt>Outcome</dt>
        <dd>{model.label}</dd>
        <dt>Factors</dt>
        <dd>{joinList(card.features.map(label))}</dd>
      </dl>
      <p>
        The model is trained on {formatCount(card.training_counties)} US counties: every county with
        a reported value for this outcome and at least one factor. It's tested with{" "}
        {`${card.n_folds}-fold`} cross-validation grouped by state, so each county's expected value
        comes from a model that never saw any county in its state. A missing factor value is filled
        with the median from the counties used to train that model; the values shown on the site are
        never filled in.
      </p>
      <p>
        Two models are compared: a ridge regression baseline and LightGBM, a gradient-boosted tree
        model. The map and county panel use LightGBM. R² is the share of the variation in each
        outcome between counties that the model accounts for (1 would be perfect). RMSE and MAE are
        typical prediction errors, in the outcome's own unit.
      </p>
      <MetricsTable
        caption="Cross-validated accuracy, by outcome"
        rows={targets.flatMap(([, t]) => [
          { target: outcomeCell(t), model: "Ridge baseline", ...t.metrics.ridge },
          { target: outcomeCell(t), model: "LightGBM", ...t.metrics.lightgbm },
        ])}
      />
      <h4 id="model-importance">Factors by importance: {model.label}</h4>
      <p>
        Each factor's average contribution to the expected values, in the outcome's unit, across all
        counties (mean absolute SHAP value).
      </p>
      <ol aria-labelledby="model-importance">
        {ranked.map((e) => (
          <li key={e.feature}>
            {label(e.feature)}:{" "}
            {formatValue(e.mean_abs_shap, model.unit, modelDigits(model.unit, 2))}
          </li>
        ))}
      </ol>
      <h4>Better or worse than expected</h4>
      <p>
        A county's difference is its actual value minus the model's expected value. Which sign is
        better depends on the outcome.
        {better &&
          ` Where higher is better (${better}), a positive difference means better than expected, and a negative one worse.`}
        {worse &&
          ` Where higher is worse (${worse}), a negative difference is better than expected, and a positive one worse.`}{" "}
        The flag colors keep blue for better than expected and red for worse, whichever way the
        outcome runs.
      </p>
      <p>
        Each county has its own range, z × √(σ_model² + se²). σ_model is the model's typical error
        once average measurement noise is taken out:{" "}
        {formatValue(sigma_model, model.unit, modelDigits(model.unit, 1))}. se is the standard error
        of the county's value, from its published confidence interval; a county without an interval
        uses the average se² instead. A difference beyond the range with z = {formatZ(z_75)} (a
        two-sided 75% range) is flagged as somewhat better or worse than expected, and beyond the
        range with z = {formatZ(z_90)} (a two-sided 90% range) as notably better or worse.
      </p>
      <h4 id="no-result" tabIndex={-1}>
        Counties with no result
      </h4>
      <p>
        A county whose value for the outcome isn't reported has no model result, because there is
        nothing to compare its expected value with. In model mode these counties are hatched and
        marked "Not enough data".
      </p>
      <h4>Factors that stand in for others</h4>
      <p>
        Some factors stand in for others the model doesn't see. For example, high housing costs
        often go with expensive metro areas and college towns, so a higher housing cost
        burden can move the expected value toward what those places tend to have. A factor's contribution shows what
        the model has learned goes with it, not what would happen if it changed.
      </p>
      <h4>Associations, not effects</h4>
      <p>
        The factors are associated with the expected value. They describe what the model expects for
        a county with that profile. They say nothing about why a county's actual value differs
        from its expected value, and they don't show that changing a factor would change{" "}
        {outcome}.
      </p>
    </section>
  );
}
