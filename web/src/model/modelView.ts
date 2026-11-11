import { formatSigned } from "../color/formatValue";
import { HATCH_FILL } from "../color/makeColorScale";
import type { CountyModel, Flag, ModelFile } from "../types";

export const TIERS: readonly Flag[] = [
  "notably_worse",
  "somewhat_worse",
  "none",
  "somewhat_better",
  "notably_better",
];

const LABELS: Record<Flag, string> = {
  notably_worse: "Notably worse than expected",
  somewhat_worse: "Somewhat worse than expected",
  none: "About as expected",
  somewhat_better: "Somewhat better than expected",
  notably_better: "Notably better than expected",
  insufficient_data: "Not enough data",
};

const FILLS: Record<Flag, string> = {
  notably_worse: "#ca0020",
  somewhat_worse: "#f4a582",
  none: "#e3e3e3",
  somewhat_better: "#92c5de",
  notably_better: "#0571b0",
  insufficient_data: HATCH_FILL,
};

export const tierLabel = (flag: Flag): string => LABELS[flag];
export const tierFill = (flag: Flag): string => FILLS[flag];

export function tierRank(flag: Flag): number | null {
  const i = TIERS.indexOf(flag);
  return i === -1 ? null : i;
}

const MISSING: CountyModel = {
  actual: null,
  predicted: null,
  residual: null,
  se: null,
  threshold_75: null,
  threshold_90: null,
  base_value: null,
  flag: "insufficient_data",
  shap: [],
};

export function countyModel(model: ModelFile, fips: string): CountyModel {
  return model.counties[fips] ?? MISSING;
}

export function tierCounts(model: ModelFile, fipsList: string[]): Record<Flag, number> {
  const counts: Record<Flag, number> = {
    notably_worse: 0,
    somewhat_worse: 0,
    none: 0,
    somewhat_better: 0,
    notably_better: 0,
    insufficient_data: 0,
  };
  for (const f of fipsList) counts[countyModel(model, f).flag] += 1;
  return counts;
}

export type CompleteModel = CountyModel & {
  actual: number;
  predicted: number;
  residual: number;
  base_value: number;
  threshold_75: number;
  threshold_90: number;
};

export function hasModelResult(entry: CountyModel): entry is CompleteModel {
  return (
    entry.flag !== "insufficient_data" &&
    entry.actual !== null &&
    entry.predicted !== null &&
    entry.residual !== null &&
    entry.base_value !== null &&
    entry.threshold_75 !== null &&
    entry.threshold_90 !== null
  );
}

export function modelTooltip(name: string, state: string, entry: CountyModel): string {
  if (!hasModelResult(entry) || entry.residual === null) {
    return `${name}, ${state}: not enough data for the model`;
  }
  return `${name}, ${state}: ${tierLabel(entry.flag).toLowerCase()} (${formatSigned(entry.residual, "years")})`;
}
