import type { Indicator } from "../types";

const SOURCE_NAMES: Record<Indicator["source"], string> = {
  acs: "Census ACS 5-year",
  places: "CDC PLACES",
  chr: "County Health Rankings",
};

// The catalog's year is the data year for ACS and PLACES but the release year for CHR.
export function sourceLine({ source, year }: Indicator): string {
  return `Source: ${SOURCE_NAMES[source]}, ${year}${source === "chr" ? " release" : ""}.`;
}
