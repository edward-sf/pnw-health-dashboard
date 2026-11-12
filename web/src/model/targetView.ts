import type { ModelFile, TargetModel } from "../types";

export const DEFAULT_TARGET = "life_expectancy";

/** The model for one target. Callers pass ids already checked against `model.targets`. */
export function targetModel(model: ModelFile, id: string): TargetModel {
  const target = model.targets[id];
  if (!target) throw new Error(`unknown target ${id}`);
  return target;
}
