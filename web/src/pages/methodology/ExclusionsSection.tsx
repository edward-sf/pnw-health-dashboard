import { targetModel } from "../../model/targetView";
import type { ModelFile } from "../../types";
import { groupExcludedCounties } from "./excludedCounties";
import { Fold } from "./Fold";
import { formatCount, joinList, outcomeCell, outcomeName } from "./format";
import { MetricsTable } from "./MetricsTable";
import { SectionLayout } from "./SectionLayout";
import { stateNameForFips } from "./stateFipsNames";

const counties = (n: number) => `${formatCount(n)} ${n === 1 ? "county" : "counties"}`;

export function ExclusionsSection({
  model: file,
  targetId,
}: {
  model: ModelFile;
  targetId: string;
}) {
  const model = targetModel(file, targetId);
  const comparison = model.behaviors_comparison;
  const groups = groupExcludedCounties(model.model_card.excluded_counties);
  return (
    <section aria-labelledby="exclusions">
      <h4 id="exclusions" tabIndex={-1}>
        What the model leaves out
      </h4>
      <SectionLayout
        prose={
          <>
            <h5>Factor groups left out, {outcomeName(model.label)}</h5>
            <ul>
              {model.model_card.excluded_feature_groups.map((g) => (
                <li key={g.category}>
                  {g.category}: {g.reason}
                </li>
              ))}
            </ul>
            <h5>How much do behaviors add?</h5>
            <p>
              A second LightGBM model adds CDC PLACES health behavior measures to the factors. For
              each outcome, both models are refit on the counties with every behavior measure, so
              the comparison is like for like.
            </p>
          </>
        }
        evidence={
          <MetricsTable
            caption="Main model and with behaviors, on the same counties, by outcome"
            rows={Object.values(file.targets).flatMap((t) => [
              {
                target: outcomeCell(t),
                model: "Main model",
                ...t.behaviors_comparison.main,
              },
              {
                target: outcomeCell(t),
                model: "With behaviors",
                ...t.behaviors_comparison.behaviors,
              },
            ])}
          />
        }
      />
      {comparison.excluded_states.length > 0 && (
        <>
          <p>
            For {outcomeName(model.label)}, these states are left out of the comparison (
            {counties(comparison.main.national.n)} are compared):
          </p>
          <ul>
            {comparison.excluded_states.map((s) => (
              <li key={s.state_fips}>
                {stateNameForFips(s.state_fips)}: {counties(s.counties)}. {s.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        Only the behaviors model's accuracy metrics are used on this site. Its predictions and
        factor contributions are never shown.
      </p>
      <h5>Counties left out of training, {outcomeName(model.label)}</h5>
      {groups.length === 0 ? (
        <p>No county with a reported value for this outcome is left out.</p>
      ) : (
        <Fold
          summary={`Show ${groups.length === 1 ? "the reason" : `all ${groups.length} reasons`}`}
        >
          <ul>
            {groups.map((g) => (
              <li key={g.reason}>
                {counties(g.count)} in {joinList(g.states)}: {g.reason}
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </section>
  );
}
