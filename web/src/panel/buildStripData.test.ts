import { expect, test } from "vitest";
import type { ValueEntry } from "../types";
import { buildStripData } from "./buildStripData";

const e = (v: number | null): ValueEntry => ({ v, lo: null, hi: null }) as unknown as ValueEntry;

test("excludes nulls and counts them", () => {
  const r = buildStripData({ a: e(1), b: e(null), c: e(3) }, "a");
  expect(r.points.map(({ fips, v }) => ({ fips, v }))).toEqual([
    { fips: "a", v: 1 },
    { fips: "c", v: 3 },
  ]);
  expect(r.nullCount).toBe(1);
});

test("keeps a true zero", () => {
  const r = buildStripData({ a: e(0), b: e(2) }, "a");
  expect(r.points.map((p) => p.v)).toContain(0);
  expect(r.selected).toMatchObject({ fips: "a", v: 0 });
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

const fipsRun = Array.from({ length: 200 }, (_, i) => String(53001 + i * 2));
const entriesFor = (ids: string[], v: number) => Object.fromEntries(ids.map((id) => [id, e(v)]));

test("jitter is within [-1, 1]", () => {
  for (const p of buildStripData(entriesFor(fipsRun, 1), "x").points) {
    expect(p.jitter).toBeGreaterThanOrEqual(-1);
    expect(p.jitter).toBeLessThanOrEqual(1);
  }
});

test("jitter depends only on the FIPS", () => {
  const a = buildStripData({ "53033": e(1), "41051": e(2) }, "53033");
  const b = buildStripData({ "53033": e(99) }, "53033");
  expect(a.selected!.jitter).toEqual(expect.any(Number));
  expect(b.selected!.jitter).toBe(a.selected!.jitter);
});

test("jitter spreads consecutive FIPS across the band", () => {
  const jitters = buildStripData(entriesFor(fipsRun, 1), "x").points.map((p) => p.jitter);
  const quarters = [0, 0, 0, 0];
  for (const j of jitters) quarters[Math.min(3, Math.floor((j + 1) * 2))]! += 1;
  for (const q of quarters) expect(q).toBeGreaterThan(25);
});
