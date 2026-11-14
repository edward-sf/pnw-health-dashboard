import { defaultTargetId } from "../model/targetView";
import type { Manifest } from "../types";

export { defaultTargetId };

export type ExplorerParams = {
  indicator: string;
  county: string | null;
  target: string;
  show: "observed" | "expected";
  view: "map" | "table";
  /** The corrected query string when the given one has an invalid or legacy key, else null. */
  canonical: string | null;
};

export function parseParams(
  search: string,
  manifest: Manifest,
  fipsSet: ReadonlySet<string>,
  targetIds: readonly string[],
): ExplorerParams {
  const q = new URLSearchParams(search);
  const fixed = new URLSearchParams(search);
  let changed = false;
  const drop = (key: string) => {
    fixed.delete(key);
    changed = true;
  };
  const ids = new Set(manifest.indicators.map((x) => x.id));

  let indicator = manifest.indicators[0]?.id ?? "";
  const i = q.get("i");
  if (i !== null) {
    if (ids.has(i)) indicator = i;
    else drop("i");
  }

  let county: string | null = null;
  const c = q.get("c");
  if (c !== null) {
    if (fipsSet.has(c)) county = c;
    else drop("c");
  }

  let target = defaultTargetId(targetIds);
  const t = q.get("t");
  const validT = t !== null && targetIds.includes(t) ? t : null;
  if (validT !== null) target = validT;

  let show: ExplorerParams["show"] = "observed";
  const mode = q.get("mode");
  if (mode !== null) {
    drop("mode");
    // An old model link: the outcome becomes the measure, shown against expected.
    if (mode === "model" && ids.has(target)) {
      indicator = target;
      show = "expected";
      fixed.delete("i");
      fixed.delete("t");
      fixed.delete("show");
      fixed.set("i", target);
      fixed.set("show", "expected");
    }
  }

  const isTarget = targetIds.includes(indicator);
  if (isTarget) {
    // A model target is its own outcome, so a separate t has nothing to say.
    target = indicator;
    if (t !== null && fixed.has("t")) drop("t");
  } else if (t !== null && validT === null && fixed.has("t")) {
    drop("t");
  }

  if (mode === null || show !== "expected") {
    const s = q.get("show");
    if (s !== null) {
      if (s === "expected" && isTarget) show = "expected";
      else drop("show");
    }
  }

  const view = q.get("view");
  if (view !== null && view !== "map" && view !== "table") drop("view");

  return {
    indicator,
    county,
    target,
    show,
    view: view === "table" ? "table" : "map",
    canonical: changed ? fixed.toString() : null,
  };
}
