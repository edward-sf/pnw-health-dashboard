import type { ValueEntry } from "../types";

export type Point = { fips: string; v: number };

export function buildStripData(
  entries: Record<string, ValueEntry>,
  selected: string,
): {
  points: Point[];
  nullCount: number;
  selected: Point | null;
  below: number;
} {
  const points: Point[] = [];
  let nullCount = 0;
  for (const [fips, entry] of Object.entries(entries)) {
    if (entry.v === null) nullCount += 1;
    else points.push({ fips, v: entry.v });
  }
  const sel = points.find((p) => p.fips === selected) ?? null;
  const below = sel ? points.filter((p) => p.v < sel.v).length : 0;
  return { points, nullCount, selected: sel, below };
}
