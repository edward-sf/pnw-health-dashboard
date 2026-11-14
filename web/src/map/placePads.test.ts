import { describe, expect, test } from "vitest";
import type { Extent } from "./buildMapPaths";
import { placePads, type Shape } from "./placePads";

/** A rectangular county. */
const box = (x0: number, y0: number, x1: number, y1: number): Shape => ({
  rings: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  ],
  bounds: [
    [x0, y0],
    [x1, y1],
  ],
  area: (x1 - x0) * (y1 - y0),
});

const sizeOf = ([[x0, y0], [x1, y1]]: Extent) => [x1 - x0, y1 - y0];
const overlap = ([[ax0, ay0], [ax1, ay1]]: Extent, [[bx0, by0], [bx1, by1]]: Extent) =>
  Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)) * Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));

describe("placePads", () => {
  test("roomy counties get no pad", () => {
    expect(placePads([box(0, 0, 40, 40), box(40, 0, 80, 40)], 100, 100, 30)).toEqual([]);
  });

  test("a short county's pad is the minimum square, slid into empty space rather than a neighbour", () => {
    // A 10×10 county with a big neighbour to its left and open canvas to its right.
    const pads = placePads([box(0, 0, 50, 50), box(50, 20, 60, 30)], 100, 100, 30);
    expect(pads).toHaveLength(1);
    const { index, pad } = pads[0]!;
    expect(index).toBe(1);
    expect(sizeOf(pad)).toEqual([30, 30]);
    expect(overlap(pad, box(0, 0, 50, 50).bounds)).toBe(0);
    // It still covers the county.
    expect(overlap(pad, box(50, 20, 60, 30).bounds)).toBe(100);
  });

  test("of two short neighbours the smaller is placed first and drawn on top", () => {
    const pads = placePads([box(40, 40, 60, 60), box(60, 45, 65, 50)], 120, 120, 30);
    expect(pads.map((p) => p.index)).toEqual([0, 1]);
  });

  test("a roomy county left short by its neighbours' pads gets one too", () => {
    // A 32-wide county squeezed between two tiny counties whose pads can only grow into it,
    // because the canvas ends on the other side of each.
    const shapes = [box(4, 0, 36, 30), box(0, 0, 4, 30), box(36, 0, 40, 30)];
    const pads = placePads(shapes, 40, 30, 30);
    expect(pads.map((p) => p.index).sort()).toEqual([0, 1, 2]);
  });
});
