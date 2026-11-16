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

export type RankSummary = {
  /** Shown on screen: "10/139 counties (3rd in WA)". */
  text: string;
  /** The accessible name and hover text, which says which way is first. */
  label: string;
};

export function rankSummary(
  fips: string,
  entries: Record<string, ValueEntry>,
  counties: County[],
): RankSummary | null {
  const entry = entries[fips];
  if (!entry || entry.rank === null) return null;
  const self = counties.find((c) => c.fips === fips);
  const ranked = counties.filter((c) => entries[c.fips]?.rank != null);
  const text = `${entry.rank}/${ranked.length} counties`;
  const label = `${ordinal(entry.rank)} most favorable of ${ranked.length} counties`;
  if (!self || entry.state_rank === null) return { text, label };
  const inState = ranked.filter((c) => c.state === self.state).length;
  const stateName = STATE_NAMES[self.state] ?? self.state;
  return {
    text: `${text} (${ordinal(entry.state_rank)} in ${self.state})`,
    label: `${label}, ${ordinal(entry.state_rank)} of ${inState} in ${stateName}`,
  };
}
