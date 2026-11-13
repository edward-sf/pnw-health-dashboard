import type { Indicator } from "../types";

export type MeasureGroup = "indicators" | "demographics" | "outcomes";

export const GROUPS: readonly { id: MeasureGroup; label: string }[] = [
  { id: "indicators", label: "Indicators" },
  { id: "demographics", label: "Demographics" },
  { id: "outcomes", label: "Outcomes" },
];

export function groupOf(category: string): MeasureGroup {
  if (category === "Demographics") return "demographics";
  if (category === "Outcomes") return "outcomes";
  return "indicators";
}

/** One entry per manifest category in the group, in manifest order. */
export function measuresIn(
  indicators: Indicator[],
  group: MeasureGroup,
): { heading: string; items: Indicator[] }[] {
  const sections = new Map<string, Indicator[]>();
  for (const ind of indicators) {
    if (groupOf(ind.category) !== group) continue;
    const items = sections.get(ind.category);
    if (items) items.push(ind);
    else sections.set(ind.category, [ind]);
  }
  return [...sections].map(([heading, items]) => ({ heading, items }));
}
