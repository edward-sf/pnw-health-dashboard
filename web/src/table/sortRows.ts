import type { County, ValueEntry } from "../types";

export type Row = County & { entry: ValueEntry | undefined };
export type SortKey = "name" | "state" | "value" | "rank" | "state_rank";
export type SortDir = "asc" | "desc";

function numberFor(r: Row, key: "value" | "rank" | "state_rank"): number | null {
  const e = r.entry;
  if (!e) return null;
  return key === "value" ? e.v : e[key];
}

/** Compares two nullable numbers; nulls sort last in both directions. */
export function compareNullable(x: number | null, y: number | null, sign: 1 | -1): number {
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return sign * (x - y);
}

export function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * byName(a, b);
    if (key === "state") return sign * a.state.localeCompare(b.state) || byName(a, b);
    return compareNullable(numberFor(a, key), numberFor(b, key), sign) || byName(a, b);
  });
}
