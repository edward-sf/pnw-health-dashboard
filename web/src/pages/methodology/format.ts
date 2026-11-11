import type { Indicator, ModelFile } from "../../types";

export type MetricSet = ModelFile["metrics"]["ridge"]["national"];

export const formatMetric = (v: number): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCount = (n: number): string => n.toLocaleString("en-US");

export function featureLabel(id: string, indicators: Indicator[]): string {
  return indicators.find((i) => i.id === id)?.label ?? id;
}

const list = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" });

/** "a", "a and b", "a, b and c" — no serial comma, matching the site's copy. */
export function joinList(items: string[]): string {
  return list.format(items).replace(/, and /, " and ");
}
