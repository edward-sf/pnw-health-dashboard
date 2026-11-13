import { STATE_NAMES } from "../panel/rankSummary";
import type { County } from "../types";

/** Counties whose "Name, ST" label contains the text, then those matching only by full state name. */
export function matchCounties(counties: County[], text: string, max = 8): County[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const all = counties.map((c) => ({ c, label: `${c.name}, ${c.state}`.toLowerCase() }));
  const byLabel = all.filter((o) => o.label.includes(q));
  // State-name matches go last so "Washington" keeps Washington County within the cap.
  const byStateName = all.filter(
    (o) =>
      !o.label.includes(q) &&
      `${o.c.name}, ${STATE_NAMES[o.c.state] ?? o.c.state}`.toLowerCase().includes(q),
  );
  return [...byLabel, ...byStateName].slice(0, max).map((o) => o.c);
}
