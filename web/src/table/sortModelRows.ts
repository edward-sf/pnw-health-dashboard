import { tierRank } from "../model/modelView";
import type { County, CountyModel, TargetModel } from "../types";
import { compareNullable, type SortDir } from "./sortRows";

export type ModelRow = County & { model: CountyModel };
export type ModelSortKey = "name" | "state" | "actual" | "expected" | "difference" | "result";

/**
 * Sort model rows. The "result" key orders by tier, then by the residual signed
 * so that larger is better (negated for higher_is_worse targets), so ascending
 * runs worst to best within and across tiers for every target.
 */
export function sortModelRows(
  rows: ModelRow[],
  key: ModelSortKey,
  dir: SortDir,
  direction: TargetModel["direction"],
): ModelRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const goodness = (r: ModelRow): number | null =>
    r.model.residual === null
      ? null
      : direction === "higher_is_worse"
        ? -r.model.residual
        : r.model.residual;
  const byName = (a: ModelRow, b: ModelRow) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    switch (key) {
      case "name":
        return sign * byName(a, b);
      case "state":
        return sign * a.state.localeCompare(b.state) || byName(a, b);
      case "actual":
        return compareNullable(a.model.actual, b.model.actual, sign) || byName(a, b);
      case "expected":
        return compareNullable(a.model.predicted, b.model.predicted, sign) || byName(a, b);
      case "difference":
        return compareNullable(a.model.residual, b.model.residual, sign) || byName(a, b);
      case "result":
        return (
          compareNullable(tierRank(a.model.flag), tierRank(b.model.flag), sign) ||
          compareNullable(goodness(a), goodness(b), sign) ||
          byName(a, b)
        );
    }
  });
}
