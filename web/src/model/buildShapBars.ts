import { formatSigned, formatValue } from "../color/formatValue";
import type { CountyModel, Indicator } from "../types";

export type ShapBar = {
  key: string;
  label: string;
  contribution: number;
  contributionText: string;
  other: boolean;
};

function labelFor(feature: string, value: number | null, indicators: Indicator[]): string {
  const ind = indicators.find((i) => i.id === feature);
  const name = ind?.label ?? feature;
  if (value === null) return `${name}: value not reported; estimated`;
  const shown = ind
    ? formatValue(value, ind.unit)
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${name}: ${shown}`;
}

export function buildShapBars(entry: CountyModel, indicators: Indicator[]): ShapBar[] {
  if (entry.predicted === null || entry.base_value === null) return [];
  const bars: ShapBar[] = entry.shap.map((s) => ({
    key: s.feature,
    label: labelFor(s.feature, s.value, indicators),
    contribution: s.contribution,
    contributionText: formatSigned(s.contribution, "years", 2),
    other: false,
  }));
  const rest = entry.predicted - entry.base_value - bars.reduce((t, b) => t + b.contribution, 0);
  bars.push({
    key: "other",
    label: "All other factors",
    contribution: rest,
    contributionText: formatSigned(rest, "years", 2),
    other: true,
  });
  return bars;
}
