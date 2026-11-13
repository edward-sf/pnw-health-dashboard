import { describe, expect, test } from "vitest";
import type { CountiesTopology } from "../types";
import { MAP_LAYOUT } from "./buildMapPaths";
import { buildStateBorders } from "./buildStateBorders";

// WA sits directly north of OR and the two share one arc (index 1); the fixture's counties are
// disjoint boxes, so it has no shared edges.
const twoStates: CountiesTopology = {
  type: "Topology",
  arcs: [
    [[-123, 46], [-123, 47], [-121, 47], [-121, 46]],
    [[-121, 46], [-123, 46]],
    [[-121, 46], [-121, 45], [-123, 45], [-123, 46]],
  ],
  objects: {
    counties: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", arcs: [[0, 1]], properties: { fips: "53033", name: "King", state: "WA" } },
        { type: "Polygon", arcs: [[~1, 2]], properties: { fips: "41051", name: "Multnomah", state: "OR" } },
      ],
    },
  },
};

describe("buildStateBorders", () => {
  test("returns a non-empty path inside the main extent", () => {
    const d = buildStateBorders(twoStates);
    expect(d.startsWith("M")).toBe(true);
    const n = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    expect(n.length).toBeGreaterThan(0);
    const [[x0, y0], [x1, y1]] = MAP_LAYOUT.main;
    for (let i = 0; i + 1 < n.length; i += 2) {
      expect(n[i]!).toBeGreaterThanOrEqual(x0 - 1);
      expect(n[i]!).toBeLessThanOrEqual(x1 + 1);
      expect(n[i + 1]!).toBeGreaterThanOrEqual(y0 - 1);
      expect(n[i + 1]!).toBeLessThanOrEqual(y1 + 1);
    }
  });

  test("a topology with one state has no borders", () => {
    const oneState: CountiesTopology = {
      ...twoStates,
      objects: {
        counties: { ...twoStates.objects.counties, geometries: twoStates.objects.counties.geometries.slice(0, 1) },
      },
    };
    expect(buildStateBorders(oneState)).toBe("");
  });
});
