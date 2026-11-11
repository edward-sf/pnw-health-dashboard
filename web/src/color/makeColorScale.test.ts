import { schemeBlues, schemeOrRd } from "d3-scale-chromatic";
import { expect, test } from "vitest";
import type { Direction, Indicator, ValueEntry } from "../types";
import { HATCH_FILL, makeColorScale } from "./makeColorScale";

const ind = (direction: Direction): Indicator => ({
  id: "x",
  label: "X",
  unit: "percent",
  source: "acs",
  source_field: "f",
  moe_field: null,
  ci_level: null,
  year: 2023,
  category: "Demographics",
  direction,
  description: "d",
});
const entries = (vs: (number | null)[]): Record<string, ValueEntry> =>
  Object.fromEntries(
    vs.map((v, i) => [
      String(i).padStart(5, "0"),
      { v, lo: null, hi: null, rank: null, state_rank: null },
    ]),
  );
const scale = (dir: Direction, vs: (number | null)[]) =>
  makeColorScale(ind(dir), entries(vs));
const ORRD = schemeOrRd[5] ?? [];
const BLUES = schemeBlues[5] ?? [];
const vs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test("higher_is_worse: darkest color at the top", () => {
  expect(scale("higher_is_worse", vs).fill(10)).toBe(ORRD[4]);
  expect(scale("higher_is_worse", vs).fill(1)).toBe(ORRD[0]);
});
test("higher_is_better reverses the ramp", () => {
  expect(scale("higher_is_better", vs).fill(10)).toBe(ORRD[0]);
  expect(scale("higher_is_better", vs).fill(1)).toBe(ORRD[4]);
});
test("neutral uses blues, darker is higher, no better/worse ends", () => {
  const s = scale("neutral", vs);
  expect(s.fill(10)).toBe(BLUES[4]);
  expect(s.ends).toBeNull();
});
test("ends follow direction", () => {
  expect(scale("higher_is_worse", vs).ends).toEqual({ low: "Better", high: "Worse" });
  expect(scale("higher_is_better", vs).ends).toEqual({ low: "Worse", high: "Better" });
});
test("null is hatched, zero is colored", () => {
  const s = scale("higher_is_worse", [0, 1, 2, 3, null]);
  expect(s.fill(null)).toBe(HATCH_FILL);
  expect(s.fill(0)).not.toBe(HATCH_FILL);
});
test("nulls do not affect bins", () => {
  expect(scale("higher_is_worse", [...vs, null]).bins).toEqual(
    scale("higher_is_worse", vs).bins,
  );
});
test("ties collapse empty bins", () => {
  const b = scale("higher_is_worse", [5, 5, 5, 5, 5, 5, 9]).bins;
  expect(b.length).toBeLessThan(5);
  expect(b.every((x) => x.min <= x.max)).toBe(true);
});
test("all-null gives no bins and does not throw", () => {
  const s = scale("higher_is_worse", [null, null]);
  expect(s.bins).toEqual([]);
  expect(s.fill(null)).toBe(HATCH_FILL);
});
