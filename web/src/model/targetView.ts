import type { ModelFile, TargetModel } from "../types";

export const DEFAULT_TARGET = "life_expectancy";

/** The default target: DEFAULT_TARGET when the model has it, otherwise the first one. */
export const defaultTargetId = (targetIds: readonly string[]): string =>
  targetIds.includes(DEFAULT_TARGET) ? DEFAULT_TARGET : (targetIds[0] ?? "");

/**
 * An outcome's label as running text: lower-cased, with any trailing parenthetical such as
 * "(years lost)" removed.
 */
export const outcomeName = (label: string): string =>
  label.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();

/** The model for one target. Callers pass ids already checked against `model.targets`. */
export function targetModel(model: ModelFile, id: string): TargetModel {
  const target = model.targets[id];
  if (!target) throw new Error(`unknown target ${id}`);
  return target;
}

/** For higher_is_worse targets, the sentence saying a positive difference is worse; otherwise null. */
export function directionNote(target: TargetModel): string | null {
  return target.direction === "higher_is_worse"
    ? "Higher is worse for this measure, so a positive difference means worse than expected."
    : null;
}
