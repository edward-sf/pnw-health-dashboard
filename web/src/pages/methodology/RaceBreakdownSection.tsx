import { Link } from "react-router";
import type { Indicator, StrataFile } from "../../types";

export function RaceBreakdownSection({
  strata,
  indicators,
}: {
  strata: StrataFile;
  indicators: Indicator[];
}) {
  const labelOf = (id: string) => indicators.find((i) => i.id === id)?.label ?? id;
  const measures = Object.keys(strata.indicators).map(labelOf);
  const profile = indicators.filter((i) => i.profile);
  return (
    <section aria-labelledby="race-breakdown">
      <h3 id="race-breakdown" tabIndex={-1}>
        Outcomes by race and ethnicity
      </h3>
      <p>
        The county panel shows {measures.length} outcome measures by race and ethnicity wherever
        County Health Rankings {strata.year} (CHR) publishes a value. Each group's value comes with the confidence interval CHR publishes,
        next to the county's overall value. The measures are:
      </p>
      <ul>
        {measures.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <h4>Group definitions</h4>
      <p>
        Group definitions are CHR's. For the measures built on National Center for Health
        Statistics data, CHR describes the categories as exclusive: each person counts in one
        group. The Hispanic or Latino group includes people of any race, and the other groups are
        people who do not identify as Hispanic. Preventable hospital stays comes from Medicare
        data, where CHR follows American Community Survey categories, combines Asian and Pacific
        Islander people, and notes that race and ethnicity are not self-reported. CHR describes its
        categories in the documentation for its 2024 data release; we found no separate statement
        for {strata.year}, and the groups here use the names CHR gives them.
      </p>
      <h4>Years of data</h4>
      <p>
        CHR lists the overall measures as: life expectancy and premature death, 2020 to 2022; low
        birth weight, 2017 to 2023; injury deaths, 2018 to 2022; preventable hospital stays, 2022.
        The CHR documents we read do not say whether the race-specific figures pool the same
        years, so they may differ from the county's overall value.
      </p>
      <h4>Groups CHR does not report</h4>
      <p>
        CHR does not report a group when there are too few cases to give a stable figure, so
        most counties have values for only a few groups. The county panel lists the
        groups with no value by name instead of leaving a blank. A missing group is not a zero
        and does not mean there is no gap. Some reported values carry CHR's unreliable flag, and
        the panel marks them as described under{" "}
        <Link to={{ hash: "unreliable" }}>unreliable estimates</Link>. Chugach and Copper River,
        the two census areas that replaced Valdez-Cordova in 2019, have no breakdown because CHR
        reports no values for them.
      </p>
      <h4>Not mapped or ranked</h4>
      <p>
        The breakdown is not mapped or ranked. Outside the White and Hispanic groups, a group has
        values in few counties, so a map would be mostly empty and a rank among the few counties
        that report would mislead. The breakdown does not change the map, the table or the model.
      </p>
      <h4>Who lives here</h4>
      <p>
        The "Who lives here" section of the county panel comes from American Community Survey
        estimates and covers every county. Each percentage is a share of the group its universe
        names:
      </p>
      <ul>
        {profile.map((i) => (
          <li key={i.id}>
            {i.label}
            {i.universe ? ` (${i.universe})` : ""}
          </li>
        ))}
      </ul>
      <p>
        These describe who lives in a county. They are not outcomes by group, and Demographics
        indicators are never model features.
      </p>
    </section>
  );
}
