import { scaleQuantile } from "d3-scale";
import { schemeBlues, schemeOrRd } from "d3-scale-chromatic";
import type { Indicator, ValueEntry } from "../types";

export const HATCH_FILL = "url(#hatch-null)" as const;

export type LegendBin = { color: string; min: number; max: number };
export type ColorScale = {
  fill: (v: number | null) => string;
  bins: LegendBin[];
  ends: { low: "Better" | "Worse"; high: "Better" | "Worse" } | null;
};

export function makeColorScale(
  indicator: Indicator,
  entries: Record<string, ValueEntry>,
): ColorScale {
  const values = Object.values(entries)
    .map((e) => e.v)
    .filter((v): v is number => v !== null);

  const { direction } = indicator;
  const ramp: string[] =
    direction === "neutral"
      ? [...(schemeBlues[5] ?? [])]
      : direction === "higher_is_worse"
        ? [...(schemeOrRd[5] ?? [])]
        : [...(schemeOrRd[5] ?? [])].reverse();
  const ends: ColorScale["ends"] =
    direction === "neutral"
      ? null
      : direction === "higher_is_worse"
        ? { low: "Better", high: "Worse" }
        : { low: "Worse", high: "Better" };

  const quantile = scaleQuantile<string>().domain(values).range(ramp);
  const fill = (v: number | null): string =>
    v === null || values.length === 0 ? HATCH_FILL : quantile(v);

  const groups = new Map<string, LegendBin>();
  for (const v of [...values].sort((a, b) => a - b)) {
    const color = fill(v);
    const g = groups.get(color);
    if (g) g.max = v;
    else groups.set(color, { color, min: v, max: v });
  }
  const bins = [...groups.values()].sort((a, b) => a.min - b.min);

  return { fill, bins, ends };
}
