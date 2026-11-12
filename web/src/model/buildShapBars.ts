import { formatSigned, formatValue } from "../color/formatValue";
import { modelDigits } from "./modelView";
import type { CountyModel, Indicator, Unit } from "../types";

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

const roundTo = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function buildShapBars(entry: CountyModel, indicators: Indicator[], unit: Unit): ShapBar[] {
  if (entry.predicted === null || entry.base_value === null) return [];
  const digits = modelDigits(unit, 2) ?? 2;
  const round2 = (v: number) => roundTo(v, digits);
  const bars: ShapBar[] = entry.shap.map((s) => ({
    key: s.feature,
    label: labelFor(s.feature, s.value, indicators),
    contribution: round2(s.contribution),
    contributionText: formatSigned(round2(s.contribution), unit, digits),
    other: false,
  }));
  const rest = round2(
    round2(entry.predicted) - round2(entry.base_value) - bars.reduce((t, b) => t + b.contribution, 0),
  );
  bars.push({
    key: "other",
    label: "All other factors",
    contribution: rest,
    contributionText: formatSigned(rest, unit, digits),
    other: true,
  });
  return bars;
}
