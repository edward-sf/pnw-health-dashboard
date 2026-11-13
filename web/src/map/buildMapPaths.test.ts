import { describe, expect, test } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths, haloWidth, MAP_LAYOUT, type Extent, type MapPath } from "./buildMapPaths";

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

describe("MAP_LAYOUT", () => {
  test("Alaska's block is at least twice its old area share", () => {
    const [[x0, y0], [x1, y1]] = MAP_LAYOUT.inset;
    const share = ((x1 - x0) * (y1 - y0)) / (MAP_LAYOUT.width * MAP_LAYOUT.height);
    expect(share).toBeGreaterThanOrEqual(2 * ((320 * 284) / (960 * 600)));
  });

  test("the two blocks do not overlap", () => {
    expect(MAP_LAYOUT.inset[1][0]).toBeLessThan(MAP_LAYOUT.main[0][0]);
  });
});

describe("haloWidth", () => {
  test("a roomy, solid county gets no halo", () => {
    expect(haloWidth([[0, 0], [60, 40]], 2000)).toBe(0);
  });

  test("a county narrower than the minimum gets the shortfall, at least 12", () => {
    // The minimum is 30 canvas units: 24 CSS px once the map is drawn at 0.8 scale or more.
    expect(haloWidth([[0, 0], [60, 10]], 500)).toBe(20);
    expect(haloWidth([[0, 0], [60, 20]], 1100)).toBe(12);
    expect(haloWidth([[0, 0], [60, 29]], 1600)).toBe(12);
    expect(haloWidth([[0, 0], [60, 30]], 1600)).toBe(0);
  });

  test("a sparse island chain gets a halo even when its box is large", () => {
    // fill ratio = area / box area < 0.15
    expect(haloWidth([[0, 0], [200, 60]], 300)).toBe(16);
  });

  test("a sparse multi-island county from the topology gets a halo", () => {
    // The fixture has Aleutians West (02016) but not Aleutians East (02013); the real topology's
    // two Aleutian counties are the same shape of problem.
    const byFips = new Map(buildMapPaths(topology).map((p) => [p.fips, p]));
    expect(byFips.get("02016")!.halo).toBeGreaterThan(0);
  });
});
