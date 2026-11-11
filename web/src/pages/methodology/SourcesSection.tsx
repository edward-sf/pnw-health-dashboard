import type { Manifest } from "../../types";

type Sources = Manifest["sources"];

export const SOURCE_NAMES: Record<string, string> = {
  acs: "Census American Community Survey (5-year)",
  places: "CDC PLACES",
  chr: "County Health Rankings & Roadmaps",
  boundaries: "Census cartographic boundary files",
};

const USES: Record<string, string> = {
  acs: "Social and economic indicators, population shares and most model factors",
  places: "Model-based estimates of chronic conditions, health behaviors and prevention",
  chr: "Life expectancy (the model's target), premature death, access to care and rurality",
  boundaries: "County shapes for the map",
};

const LEGACY_USE =
  "Values for the former Valdez-Cordova Census Area, which current releases no longer report";

export const sourceName = (id: string): string => SOURCE_NAMES[id] ?? id;

/** The newest year listed for each source; older rows of the same source are legacy vintages. */
export function latestYears(sources: Sources): Map<string, number> {
  const latest = new Map<string, number>();
  for (const { source, year } of sources) {
    latest.set(source, Math.max(year, latest.get(source) ?? year));
  }
  return latest;
}

export function SourcesSection({ sources }: { sources: Sources }) {
  const latest = latestYears(sources);
  return (
    <section aria-labelledby="sources">
      <h2 id="sources" tabIndex={-1}>
        Sources and vintages
      </h2>
      <p>
        Every value comes from a public federal or national source, fetched for all US counties
        and shown for the Pacific Northwest. The vintage is the data year for ACS and PLACES and the
        release year for County Health Rankings.
      </p>
      <div className="methodology-table-wrap">
        <table className="methodology-table">
          <caption>Data sources</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Vintage</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(({ source, year, url }) => {
              const legacy = source === "chr" && year < (latest.get("chr") ?? year);
              return (
                <tr key={`${source}-${year}`}>
                  <th scope="row">
                    <a href={url}>{sourceName(source)}</a>
                    {legacy && " (legacy values for the former Valdez-Cordova Census Area)"}
                  </th>
                  <td>{year}</td>
                  <td>{legacy ? LEGACY_USE : (USES[source] ?? "")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        CDC WONDER isn't used: its API doesn't support queries below the national level, so
        county data can't be fetched from it.
      </p>
    </section>
  );
}
