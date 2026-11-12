import type { ModelFile, TargetModel } from "../types";

export const DEFAULT_TARGET = "life_expectancy";

/** An outcome's label as running text: lower case, without a trailing "(years lost)" and the like. */
export const outcomeName = (label: string): string =>
  label.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();

/** The model for one target. Callers pass ids already checked against `model.targets`. */
export function targetModel(model: ModelFile, id: string): TargetModel {
  const target = model.targets[id];
  if (!target) throw new Error(`unknown target ${id}`);
  return target;
}

/** The sentence that says which way is worse, for targets where a positive difference is bad. */
export function directionNote(target: TargetModel): string | null {
  return target.direction === "higher_is_worse"
    ? "Higher is worse for this measure, so a positive difference means worse than expected."
    : null;
}
