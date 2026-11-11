import { tierRank } from "../model/modelView";
import type { County, CountyModel } from "../types";
import { compareNullable, type SortDir } from "./sortRows";

export type ModelRow = County & { model: CountyModel };
export type ModelSortKey = "name" | "state" | "actual" | "expected" | "difference" | "result";

export function sortModelRows(rows: ModelRow[], key: ModelSortKey, dir: SortDir): ModelRow[] {
  const sign = dir === "asc" ? 1 : -1;
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
          compareNullable(a.model.residual, b.model.residual, sign) ||
          byName(a, b)
        );
    }
  });
}
