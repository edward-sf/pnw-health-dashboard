import type { ValueEntry } from "../types";

export type Point = { fips: string; v: number; jitter: number };

// FNV-1a with a murmur3 finalizer. The finalizer matters: FIPS codes differ
// mostly in their last digits, which plain FNV barely moves into the high bits.
function jitterFor(fips: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < fips.length; i += 1) {
    h = Math.imul(h ^ fips.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

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
    else points.push({ fips, v: entry.v, jitter: jitterFor(fips) });
  }
  const sel = points.find((p) => p.fips === selected) ?? null;
  const below = sel ? points.filter((p) => p.v < sel.v).length : 0;
  return { points, nullCount, selected: sel, below };
}
