import { expect, test } from "vitest";
import type { ValueEntry } from "../types";
import { buildStripData } from "./buildStripData";

const e = (v: number | null): ValueEntry => ({ v, lo: null, hi: null }) as unknown as ValueEntry;

test("excludes nulls and counts them", () => {
  const r = buildStripData({ a: e(1), b: e(null), c: e(3) }, "a");
  expect(r.points).toEqual([
    { fips: "a", v: 1 },
    { fips: "c", v: 3 },
  ]);
  expect(r.nullCount).toBe(1);
});

test("keeps a true zero", () => {
  const r = buildStripData({ a: e(0), b: e(2) }, "a");
  expect(r.points).toContainEqual({ fips: "a", v: 0 });
  expect(r.selected).toEqual({ fips: "a", v: 0 });
  expect(r.below).toBe(0);
});

test("null selected county gives null selected", () => {
  const r = buildStripData({ a: e(null), b: e(2) }, "a");
  expect(r.selected).toBeNull();
  expect(r.below).toBe(0);
});

test("missing selected county gives null selected", () => {
  expect(buildStripData({ b: e(2) }, "zzz").selected).toBeNull();
});

test("below counts strictly lower values with ties", () => {
  const r = buildStripData({ a: e(5), b: e(5), c: e(1), d: e(9), e: e(0) }, "a");
  expect(r.below).toBe(2);
});
