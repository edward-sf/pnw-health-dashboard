import type { Manifest } from "../../types";
import { latestYears, sourceName } from "./SourcesSection";

export function HarmonizationSection({ sources }: { sources: Manifest["sources"] }) {
  const latestChr = latestYears(sources).get("chr");
  const legacyYear = sources
    .filter((s) => s.source === "chr" && latestChr !== undefined && s.year < latestChr)
    .reduce<number | null>((max, s) => (max === null ? s.year : Math.max(max, s.year)), null);
  const legacySource =
    legacyYear === null ? sourceName("chr") : `${sourceName("chr")} ${legacyYear}`;
  return (
    <section aria-labelledby="harmonization">
      <h2 id="harmonization" tabIndex={-1}>
        Geography
      </h2>
      <p>
        Every source is joined on 2020 Census county codes (five-digit FIPS codes), so a county
        means the same area in every dataset.
      </p>
      <p>
        Alaska's Wade Hampton Census Area (02270) was renamed Kusilvak Census Area (02158). Data
        still filed under the old code is moved to the new one.
      </p>
      <h3 id="legacy" tabIndex={-1}>
        The former Valdez-Cordova Census Area
      </h3>
      <p>
        Alaska's Valdez-Cordova Census Area (02261) was split into the Chugach (02063) and Copper
        River (02066) Census Areas. For some measures, current releases have no value for either
        new area, while an older release has one for the combined area.
      </p>
      <p>
        Those values aren't copied to Chugach or Copper River, because a value for the combined
        area isn't a value for either part. Their value stays empty, and the county panel shows the
        former area's value separately as a legacy value, taken from {legacySource}. Legacy values
        are left out of ranks and out of model training.
      </p>
    </section>
  );
}
