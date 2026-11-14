import { describe, expect, test } from "vitest";
import { topology } from "../test/fixtures";
import { buildMapPaths, haloWidth, MAP_LAYOUT, MIN_HIT, type Extent, type MapPath } from "./buildMapPaths";

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

  test("a sparse island chain with a roomy box gets a halo under the counties", () => {
    // fill ratio = area / box area < 0.15
    expect(haloWidth([[0, 0], [200, 60]], 300)).toBe(16);
  });

  test("a county short of the minimum gets a pad, not a halo", () => {
    // The minimum is 31 canvas units: 24 CSS px once the map is drawn 1000px wide or more.
    expect(MIN_HIT).toBe(31);
    expect(haloWidth([[0, 0], [200, 30]], 300)).toBe(0);
  });
});

describe("pads from the topology", () => {
  const byFips = new Map(buildMapPaths(topology).map((p) => [p.fips, p]));

  test("a county drawn short of the minimum gets a minimum-size pad over its own box", () => {
    // Chugach (02063) is drawn smaller than the minimum on both sides.
    const chugach = byFips.get("02063")!;
    const [[x0, y0], [x1, y1]] = chugach.pad!.rect;
    expect([x1 - x0, y1 - y0]).toEqual([MIN_HIT, MIN_HIT]);
    expect(chugach.halo).toBe(0);
  });

  test("an island chain spread over a roomy box keeps a halo and gets no pad", () => {
    // Aleutians West (02016) spans the inset but is mostly sea.
    expect(byFips.get("02016")).toMatchObject({ halo: 16, pad: null });
  });

  test("a roomy, solid county gets neither", () => {
    expect(byFips.get("53033")).toMatchObject({ halo: 0, pad: null });
  });

  test("pads have distinct layers and each path carries its drawn area", () => {
    const layers = [...byFips.values()].flatMap((p) => (p.pad ? [p.pad.layer] : []));
    expect(new Set(layers).size).toBe(layers.length);
    for (const p of byFips.values()) expect(p.area).toBeGreaterThan(0);
  });
});
