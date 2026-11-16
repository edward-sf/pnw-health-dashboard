import type { Indicator } from "../../types";
import { SectionLayout } from "./SectionLayout";
const percent = (level: number) => `${Math.round(level * 100)}%`;

function levels(indicators: Indicator[]): string[] {
  const set = new Set<number>();
  for (const i of indicators) if (i.ci_level !== null) set.add(i.ci_level);
  return [...set].sort((a, b) => a - b).map(percent);
}

export function MissingDataSection({ indicators }: { indicators: Indicator[] }) {
  const acs = levels(indicators.filter((i) => i.source === "acs"));
  const others = levels(indicators.filter((i) => i.source !== "acs"));
  return (
    <section aria-labelledby="missing-data">
      <h4 id="missing-data" tabIndex={-1}>
        Missing and uncertain values
      </h4>
      <SectionLayout
        prose={
          <>
            <h5 id="suppression" tabIndex={-1}>
              Suppressed or missing values
            </h5>
            <p>
              Sources leave some values out, for example when a county has too few people or events
              for a reliable or private estimate. These values stay empty and are never filled in or
              estimated. The map shows them with a hatched pattern, the table and county panel say
              "Suppressed or not available", and they have no rank.
            </p>
            <h5 id="unreliable" tabIndex={-1}>
              Unreliable estimates
            </h5>
            <p>
              Some sources mark an estimate as unreliable, usually because its margin of error is
              large. These estimates keep their value and rank, and the county panel and table mark
              them so you can read them with caution.
            </p>
            <h5>Confidence intervals</h5>
            <p>
              {acs.length > 0 &&
                `ACS estimates come with margins of error at the ${acs.join(" and ")} level. `}
              {others.length > 0 &&
                `Other sources' estimates carry the intervals those sources publish, at the ${others.join(" and ")} level. `}
              Where a county has an interval, the table shows it.
            </p>
          </>
        }
      />
    </section>
  );
}
