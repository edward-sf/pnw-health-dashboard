import type { County, Flag, Peers, TargetModel, ValueEntry } from "../types";

type RowBase = { fips: string; name: string; state: string; isSelected: boolean };

/** A row in Observed: the indicator value. */
export type ValuesPeerRow = RowBase & { kind: "values"; value: number | null };
/** A row in Compared with expected: the actual value, the expected value and the result. */
export type ModelPeerRow = RowBase & {
  kind: "model";
  value: number | null;
  expected: number | null;
  flag: Flag;
};
export type PeerRow = ValuesPeerRow | ModelPeerRow;

export type ValuesPeerMedian = { kind: "values"; value: number | null };
export type ModelPeerMedian = { kind: "model"; value: number | null; expected: number | null };
export type PeerMedian = ValuesPeerMedian | ModelPeerMedian;

type ValuesSource = { kind: "values"; entries: Record<string, ValueEntry> };
type ModelSource = { kind: "model"; target: TargetModel };
export type PeerSource = ValuesSource | ModelSource;

export type ValuesPeerData = { kind: "values"; rows: ValuesPeerRow[]; median: ValuesPeerMedian };
export type ModelPeerData = { kind: "model"; rows: ModelPeerRow[]; median: ModelPeerMedian };
export type PeerData = ValuesPeerData | ModelPeerData;

function median(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/**
 * The selected county first, then its peers nearest first, plus the peers' median; null when
 * the county has no peers. The result's kind follows `source.kind`.
 */
export function buildPeerRows(
  fips: string,
  peers: Peers,
  counties: County[],
  source: ValuesSource,
): ValuesPeerData | null;
export function buildPeerRows(
  fips: string,
  peers: Peers,
  counties: County[],
  source: ModelSource,
): ModelPeerData | null;
export function buildPeerRows(
  fips: string,
  peers: Peers,
  counties: County[],
  source: PeerSource,
): PeerData | null;
export function buildPeerRows(
  fips: string,
  peers: Peers,
  counties: County[],
  source: PeerSource,
): PeerData | null {
  const peerFips = peers.counties[fips];
  if (!peerFips || peerFips.length === 0) return null;
  const byFips = new Map(counties.map((c) => [c.fips, c]));
  // A peer we cannot name cannot be shown or selected, so it is left out.
  const bases: RowBase[] = [fips, ...peerFips]
    .filter((f) => byFips.has(f))
    .map((f) => {
      const c = byFips.get(f)!;
      return { fips: f, name: c.name, state: c.state, isSelected: f === fips };
    });
  if (source.kind === "values") {
    const rows: ValuesPeerRow[] = bases.map((base) => ({
      ...base,
      kind: "values",
      value: source.entries[base.fips]?.v ?? null,
    }));
    const peerRows = rows.filter((r) => !r.isSelected);
    const value = median(peerRows.map((r) => r.value));
    return { kind: "values", rows, median: { kind: "values", value } };
  }
  const rows: ModelPeerRow[] = bases.map((base) => {
    const m = source.target.counties[base.fips];
    return {
      ...base,
      kind: "model",
      value: m?.actual ?? null,
      expected: m?.predicted ?? null,
      flag: m?.flag ?? "insufficient_data",
    };
  });
  const peerRows = rows.filter((r) => !r.isSelected);
  return {
    kind: "model",
    rows,
    median: {
      kind: "model",
      value: median(peerRows.map((r) => r.value)),
      expected: median(peerRows.map((r) => r.expected)),
    },
  };
}
