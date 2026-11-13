import { useId } from "react";
import { formatValue } from "../color/formatValue";
import type { Indicator, ValuesFile } from "../types";

type Props = { fips: string; indicators: Indicator[]; values: ValuesFile };

const NOTE =
  "Shares do not overlap. People who identify with more than one race are counted under two or more races, so the American Indian and Alaska Native share undercounts them. Some other race is not shown, so shares may not sum to 100%.";

type Profile = NonNullable<Indicator["profile"]>;

const GROUPS: { profile: Profile; heading: string | null }[] = [
  { profile: "population", heading: null },
  { profile: "age_sex", heading: "Age and sex" },
  { profile: "race", heading: "Race and ethnicity" },
  { profile: "other", heading: "Other" },
];

export function WhoLivesHere({ fips, indicators, values }: Props) {
  const headingId = useId();
  const row = (ind: Indicator) => {
    const v = values[ind.id]?.[fips]?.v ?? null;
    const isPopulation = ind.profile === "population";
    return (
      <li key={ind.id} className="who-row">
        <span className="who-label">
          {ind.label}
          {ind.universe && <span className="who-universe">{ind.universe}</span>}
        </span>
        <span className="who-value">
          {v === null ? "Not available" : formatValue(v, isPopulation ? "count" : ind.unit)}
        </span>
        {v !== null && !isPopulation && (
          <span className="who-track" aria-hidden="true">
            <span className="who-bar" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
          </span>
        )}
      </li>
    );
  };
  return (
    <section className="who-lives-here" aria-labelledby={headingId}>
      <h3 id={headingId}>Who lives here</h3>
      {GROUPS.map(({ profile, heading }) => {
        const rows = indicators.filter((i) => i.profile === profile);
        if (rows.length === 0) return null;
        return (
          <div key={profile} className="who-group">
            {heading && <h4 className="who-group-heading">{heading}</h4>}
            <ul className="who-list">{rows.map(row)}</ul>
            {profile === "race" && <p className="who-note">{NOTE}</p>}
          </div>
        );
      })}
    </section>
  );
}
