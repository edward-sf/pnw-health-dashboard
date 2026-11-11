import type { County, ValueEntry } from "../types";

export const STATE_NAMES: Record<string, string> = {
  WA: "Washington",
  OR: "Oregon",
  ID: "Idaho",
  AK: "Alaska",
};

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function rankSummary(
  fips: string,
  entries: Record<string, ValueEntry>,
  counties: County[],
): string | null {
  const entry = entries[fips];
  if (!entry || entry.rank === null) return null;
  const self = counties.find((c) => c.fips === fips);
  const ranked = counties.filter((c) => entries[c.fips]?.rank != null);
  const overall = `${ordinal(entry.rank)} of ${ranked.length} counties`;
  if (!self || entry.state_rank === null) return `${overall} (1 = best)`;
  const inState = ranked.filter((c) => c.state === self.state).length;
  const stateName = STATE_NAMES[self.state] ?? self.state;
  return `${overall}, ${ordinal(entry.state_rank)} of ${inState} in ${stateName} (1 = best)`;
}
