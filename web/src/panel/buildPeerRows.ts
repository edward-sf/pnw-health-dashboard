import type { County, Flag, Peers, TargetModel, ValueEntry } from "../types";

export type PeerRow = {
  fips: string;
  name: string;
  isSelected: boolean;
  value: number | null;
  expected?: number | null;
  flag?: Flag;
};

type Source =
  | { kind: "values"; entries: Record<string, ValueEntry> }
  | { kind: "model"; target: TargetModel };

export type PeerMedian = { value: number | null; expected?: number | null };

function median(xs: (number | null | undefined)[]): number | null {
  const v = xs
    .filter((x): x is number => x !== null && x !== undefined)
    .sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** The selected county first, then its peers nearest first, plus the peers' median. */
export function buildPeerRows(
  fips: string,
  peers: Peers,
  counties: County[],
  source: Source,
): { rows: PeerRow[]; median: PeerMedian } | null {
  const peerFips = peers.counties[fips];
  if (!peerFips || peerFips.length === 0) return null;
  const names = new Map(counties.map((c) => [c.fips, c.name]));
  const rows: PeerRow[] = [fips, ...peerFips].map((f) => {
    const base = { fips: f, name: names.get(f) ?? f, isSelected: f === fips };
    if (source.kind === "values")
      return { ...base, value: source.entries[f]?.v ?? null };
    const m = source.target.counties[f];
    return {
      ...base,
      value: m?.actual ?? null,
      expected: m?.predicted ?? null,
      flag: m?.flag ?? "insufficient_data",
    };
  });
  const peerRows = rows.filter((r) => !r.isSelected);
  const result: PeerMedian = { value: median(peerRows.map((r) => r.value)) };
  if (source.kind === "model")
    result.expected = median(peerRows.map((r) => r.expected));
  return { rows, median: result };
}
