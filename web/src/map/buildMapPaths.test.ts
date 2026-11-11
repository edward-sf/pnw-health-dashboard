import { describe, expect, test } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths, MAP_LAYOUT, type Extent, type MapPath } from "./buildMapPaths";

const coords = (d: string): number[] => (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
const points = (paths: MapPath[]): [number, number][] =>
  paths.flatMap((p) => {
    const n = coords(p.d);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i]!, n[i + 1]!]);
    return out;
  });

function expectInside(paths: MapPath[], extent: Extent) {
  const [[x0, y0], [x1, y1]] = extent;
  expect(paths.length).toBeGreaterThan(0);
  for (const [x, y] of points(paths)) {
    expect(x).toBeGreaterThanOrEqual(x0 - 1);
    expect(x).toBeLessThanOrEqual(x1 + 1);
    expect(y).toBeGreaterThanOrEqual(y0 - 1);
    expect(y).toBeLessThanOrEqual(y1 + 1);
  }
}

describe("buildMapPaths", () => {
  test("one path per county with finite coordinates", () => {
    const paths = buildMapPaths(topology);
    expect(paths.map((p) => p.fips).sort()).toEqual(["02016", "02063", "16001", "41051", "53033"]);
    for (const p of paths) expect(coords(p.d).every(Number.isFinite)).toBe(true);
  });

  test("Alaska lands inside the inset, including Aleutians across the antimeridian", () => {
    expectInside(buildMapPaths(topology).filter((p) => p.state === "AK"), MAP_LAYOUT.inset);
  });

  test("the lower 48 land inside the main extent", () => {
    expectInside(buildMapPaths(topology).filter((p) => p.state !== "AK"), MAP_LAYOUT.main);
  });
});
