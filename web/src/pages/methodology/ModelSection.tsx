import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatValue } from "../../color/formatValue";
import { modelDigits } from "../../model/modelView";
import { defaultTargetId, targetModel } from "../../model/targetView";
import type { Indicator, ModelFile } from "../../types";
import { Fold } from "./Fold";
import {
  featureLabel,
  formatCount,
  joinList,
  outcomeCell,
  outcomeName,
} from "./format";
import { FactorBars } from "./FactorBars";
import { MetricsTable } from "./MetricsTable";
import { R2Comparison } from "./R2Comparison";
import { SectionLayout } from "./SectionLayout";

const formatZ = (z: number) =>
  z.toLocaleString("en-US", { maximumFractionDigits: 3 });

type Props = {
  model: ModelFile;
  targetId: string;
  onTargetChange: (id: string) => void;
  indicators: Indicator[];
};

export function ModelSection({
  model: file,
  targetId,
  onTargetChange,
  indicators,
}: Props) {
  const model = targetModel(file, targetId);
  const targets = Object.entries(file.targets);
  const names = (direction: string) =>
    joinList(
      targets
        .filter(([, t]) => t.direction === direction)
        .map(([, t]) => outcomeName(t.label)),
    );
  const better = names("higher_is_better");
  const worse = names("higher_is_worse");
  const defaultTarget = targetModel(
    file,
    defaultTargetId(Object.keys(file.targets)),
  );
  const outcome = outcomeName(model.label);
  const card = model.model_card;
  const { sigma_model, z_75, z_90 } = model.thresholds;
  const label = (id: string) => featureLabel(id, indicators);
  const ranked = [...model.global_importance].sort(
    (a, b) => b.mean_abs_shap - a.mean_abs_shap,
  );
  return (
    <section aria-labelledby="model">
      <h4 id="model" tabIndex={-1}>
        How it works
      </h4>
      <SectionLayout
        prose={
          <>
            <p>
              One model is built for each of {targets.length} outcomes, from the
              same factors:{" "}
              {joinList(targets.map(([, t]) => outcomeName(t.label)))}. The
              default is {outcomeName(defaultTarget.label)}. All come from County
              Health Rankings & Roadmaps, with a confidence interval for most
              counties.
            </p>
            <div className="methodology-select">
              <span id="methodology-outcome">Outcome</span>
              <Select value={targetId} onValueChange={onTargetChange}>
                <SelectTrigger
                  aria-labelledby="methodology-outcome"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(([id, t]) => (
                    <SelectItem key={id} value={id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p>
              Everything below, including the factors and Reproducibility,
              follows this outcome. The accuracy table covers every outcome.
            </p>
          </>
        }
        evidence={
          <R2Comparison
            national={model.metrics.lightgbm.national.r2}
            pnw={model.metrics.lightgbm.pnw.r2}
          />
        }
      />
      <div className="methodology-wide">
        <MetricsTable
          caption="Cross-validated accuracy, by outcome"
          rows={targets.flatMap(([, t]) => [
            {
              target: outcomeCell(t),
              model: "Ridge baseline",
              ...t.metrics.ridge,
            },
            {
              target: outcomeCell(t),
              model: "LightGBM",
              ...t.metrics.lightgbm,
            },
          ])}
        />
      </div>
      <div className="methodology-section">
        <dl className="methodology-dl">
          <dt>Outcome</dt>
          <dd>{model.label}</dd>
          <dt>Factors</dt>
          <dd>{joinList(card.features.map(label))}</dd>
        </dl>
        <h5>Outcomes left out</h5>
        <p>
          CDC PLACES outcomes such as diabetes, COPD and depression are not
          targets. CDC builds them partly from American Community Survey
          demographics, so predicting them from the same kind of data would
          largely reproduce CDC's own model. Low birth weight was also left out.
          The model's expected values didn't fit Pacific Northwest counties: the
          region as a whole sat well below its national expectation, so the flags
          would have shown a regional offset, not differences between counties.
        </p>
        <p>
          The model is trained on {formatCount(card.training_counties)} US
          counties: every county with a reported value for this outcome and at
          least one factor. It's tested with {`${card.n_folds}-fold`}{" "}
          cross-validation grouped by state, so each county's expected value
          comes from a model that never saw any county in its state. A missing
          factor value is filled with the median from the counties used to train
          that model; the values shown on the site are never filled in.
        </p>
        <p>
          Two models are compared: a ridge regression baseline and LightGBM, a
          gradient-boosted tree model. The map and county panel use LightGBM. R²
          is the share of the variation in each outcome between counties that
          the model accounts for (1 would be perfect). RMSE and MAE are typical
          prediction errors, in the outcome's own unit.
        </p>
        <h5 id="model-importance" tabIndex={-1}>
          Factors by importance: {model.label}
        </h5>
        <p>
          Each factor's average contribution to the expected values, in the
          outcome's unit, across all counties (mean absolute SHAP value).
        </p>
        <p>
          Ranked by how strongly each is associated with the model's estimate.
          Associations, not causes.
        </p>
        <FactorBars
          items={ranked.slice(0, 3).map((e) => ({
            label: label(e.feature),
            value: e.mean_abs_shap,
            display: formatValue(
              e.mean_abs_shap,
              model.unit,
              modelDigits(model.unit, 2),
            ),
          }))}
        />
        <Fold summary={`Show all ${ranked.length} factors`}>
          <ol aria-labelledby="model-importance">
            {ranked.map((e) => (
              <li key={e.feature}>
                {label(e.feature)}:{" "}
                {formatValue(
                  e.mean_abs_shap,
                  model.unit,
                  modelDigits(model.unit, 2),
                )}
              </li>
            ))}
          </ol>
        </Fold>
        <h5>Higher or lower than expected</h5>
        <p>
          A county's difference is its actual value minus the model's expected
          value. Which sign is more favorable depends on the outcome.
          {better &&
            ` Where higher is more favorable (${better}), a positive difference is more favorable than expected, and a negative one less favorable.`}
          {worse &&
            ` Where lower is more favorable (${worse}), a negative difference is more favorable than expected, and a positive one less favorable.`}{" "}
          The flag colors keep blue for more favorable than expected and red for
          less favorable, whichever way the outcome runs. The tiers compare a
          county with the model's estimate; they are not a judgment of the
          county.
        </p>
        <p>
          Each county has its own range, z × √(σ_model² + se²). σ_model is the
          model's typical error once average measurement noise is taken out:{" "}
          {formatValue(sigma_model, model.unit, modelDigits(model.unit, 1))}. se
          is the standard error of the county's value, from its published
          confidence interval; a county without an interval uses the average se²
          instead. A difference beyond the range with z = {formatZ(z_75)} (a
          two-sided 75% range) is flagged as somewhat higher or lower than
          expected, and beyond the range with z = {formatZ(z_90)} (a two-sided
          90% range) as notably higher or lower.
        </p>
        <h5 id="no-result" tabIndex={-1}>
          Counties with no result
        </h5>
        <p>
          A county whose value for the outcome isn't reported has no model
          result, because there is nothing to compare its expected value with.
          On the map, with Compared with expected on, these counties are hatched
          and marked "Not enough data".
        </p>
        <h5>Factors that stand in for others</h5>
        <p>
          Some factors stand in for others the model doesn't see. For example,
          high housing costs often go with expensive metro areas and college
          towns, so a higher housing cost burden can move the expected value
          toward what those places tend to have. A factor's contribution shows
          what the model has learned goes with it, not what would happen if it
          changed.
        </p>
        <h5>Associations, not effects</h5>
        <p>
          The factors are associated with the expected value. They describe what
          the model expects for a county with that profile. They say nothing
          about why a county's actual value differs from its expected value, and
          they don't show that changing a factor would change {outcome}.
        </p>
      </div>
    </section>
  );
}
