import type { ModelFile } from "../../types";
import { groupExcludedCounties } from "./excludedCounties";
import { formatCount, joinList } from "./format";
import { MetricsTable } from "./MetricsTable";
import { stateNameForFips } from "./stateFipsNames";

const counties = (n: number) => `${formatCount(n)} ${n === 1 ? "county" : "counties"}`;

export function ExclusionsSection({ model }: { model: ModelFile }) {
  const comparison = model.behaviors_comparison;
  const groups = groupExcludedCounties(model.model_card.excluded_counties);
  return (
    <section aria-labelledby="exclusions">
      <h3 id="exclusions" tabIndex={-1}>
        What the model leaves out
      </h3>
      <h4>Factor groups left out</h4>
      <ul>
        {model.model_card.excluded_feature_groups.map((g) => (
          <li key={g.category}>
            {g.category}: {g.reason}
          </li>
        ))}
      </ul>
      <h4>How much do behaviors add?</h4>
      <p>
        A second LightGBM model adds the health behavior measures from CDC PLACES to the factors.
        It and the main model are refit on the same {counties(comparison.main.national.n)}, those
        with every behavior measure, so the comparison is like for like.
      </p>
      <MetricsTable
        caption="Main model and with behaviors, on the same counties"
        rows={[
          { model: "Main model", ...comparison.main },
          { model: "With behaviors", ...comparison.behaviors },
        ]}
      />
      {comparison.excluded_states.length > 0 && (
        <>
          <p>These states are left out of the comparison:</p>
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
      <h4>Counties left out of training</h4>
      {groups.length === 0 ? (
        <p>No county with a reported life expectancy is left out.</p>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.reason}>
              {counties(g.count)} in {joinList(g.states)}: {g.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
