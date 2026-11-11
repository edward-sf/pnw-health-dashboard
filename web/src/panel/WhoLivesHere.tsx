import { useId } from "react";
import { formatValue } from "../color/formatValue";
import type { Indicator, ValuesFile } from "../types";

type Props = { fips: string; indicators: Indicator[]; values: ValuesFile };

const NOTE =
  "Shares do not overlap. People who identify with more than one race are counted under two or more races, so the American Indian and Alaska Native share undercounts them. Some other race is not shown, so shares may not sum to 100%.";

export function WhoLivesHere({ fips, indicators, values }: Props) {
  const headingId = useId();
  const rows = indicators.filter((i) => i.category === "Demographics");
  return (
    <section className="who-lives-here" aria-labelledby={headingId}>
      <h3 id={headingId}>Who lives here</h3>
      <ul className="who-list">
        {rows.map((ind) => {
          const v = values[ind.id]?.[fips]?.v ?? null;
          return (
            <li key={ind.id} className="who-row">
              <span className="who-label">{ind.label}</span>
              <span className="who-value">
                {v === null ? "Not available" : formatValue(v, ind.unit)}
              </span>
              {v !== null && (
                <span className="who-track" aria-hidden="true">
                  <span
                    className="who-bar"
                    style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="who-note">{NOTE}</p>
    </section>
  );
}
