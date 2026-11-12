import { DEFAULT_TARGET } from "../model/targetView";
import type { Manifest } from "../types";

/** The default target: DEFAULT_TARGET when the model has it, otherwise the first one. */
export const defaultTargetId = (targetIds: readonly string[]): string =>
  targetIds.includes(DEFAULT_TARGET) ? DEFAULT_TARGET : (targetIds[0] ?? "");

export type ParamKey = "i" | "c" | "t" | "mode" | "view";
export type ExplorerParams = {
  indicator: string;
  county: string | null;
  target: string;
  mode: "values" | "model";
  view: "map" | "table";
  invalid: ParamKey[];
};

export function parseParams(
  search: string,
  manifest: Manifest,
  fipsSet: ReadonlySet<string>,
  targetIds: readonly string[],
): ExplorerParams {
  const q = new URLSearchParams(search);
  const invalid: ParamKey[] = [];
  const ids = new Set(manifest.indicators.map((x) => x.id));

  let indicator = manifest.indicators[0]?.id ?? "";
  const i = q.get("i");
  if (i !== null) {
    if (ids.has(i)) indicator = i;
    else invalid.push("i");
  }

  let county: string | null = null;
  const c = q.get("c");
  if (c !== null) {
    if (fipsSet.has(c)) county = c;
    else invalid.push("c");
  }

  let target = defaultTargetId(targetIds);
  const t = q.get("t");
  if (t !== null) {
    if (targetIds.includes(t)) target = t;
    else invalid.push("t");
  }

  const mode = q.get("mode");
  if (mode !== null && mode !== "values" && mode !== "model") invalid.push("mode");
  const view = q.get("view");
  if (view !== null && view !== "map" && view !== "table") invalid.push("view");

  return { indicator, county, target, mode: mode === "model" ? "model" : "values", view: view === "table" ? "table" : "map", invalid };
}
