import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { contrastRatio } from "../color/contrast";
import { HATCH_FILL, makeColorScale } from "../color/makeColorScale";
import { DEFAULT_OUTLINE, outlineFor } from "../color/outline";
import { PALETTES } from "../color/palette";
import { TIERS, tierFill } from "../model/modelView";
import type { Direction, Indicator, ValueEntry } from "../types";

test("contrastRatio follows WCAG relative luminance", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  expect(contrastRatio("#ffffff", "#767676")).toBe(contrastRatio("#767676", "#ffffff"));
});

test("contrastRatio rejects anything but #rrggbb", () => {
  expect(() => contrastRatio("#fff", "#000000")).toThrow();
  expect(() => contrastRatio("red", "#000000")).toThrow();
});

// The fallback stroke actually shipped: `var(--county-stroke, #rrggbb)` in the `.county` rule.
function cssFallbackStroke(): string {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const block = /(?:^|\n)[ \t]*\.county\s*\{([^}]*)\}/.exec(css)?.[1];
  const stroke =
    block && /stroke:\s*var\(--county-stroke,\s*(#[0-9a-fA-F]{6})\)\s*;/.exec(block)?.[1];
  if (!stroke) throw new Error("no var(--county-stroke, #rrggbb) stroke in the .county rule");
  return stroke;
}

test("the CSS fallback stroke is the default outline", () => {
  expect(cssFallbackStroke()).toBe(DEFAULT_OUTLINE);
});

// The fills the map actually draws, from their producers: makeColorScale's bins for every
// indicator direction, and every solid model tier. 30 distinct values give all 5 quantile bins.
const indicator = (direction: Direction): Indicator => ({
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
const values: Record<string, ValueEntry> = Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [
    String(i).padStart(5, "0"),
    { v: i, lo: null, hi: null, rank: null, state_rank: null },
  ]),
);
const DIRECTIONS: Direction[] = ["higher_is_worse", "higher_is_better", "neutral"];
const binFills = (direction: Direction) =>
  makeColorScale(indicator(direction), values).bins.map((b) => b.color);

const SOLID_TIERS = TIERS.filter((t) => t !== "none");

describe.each(Object.entries(PALETTES))("the %s palette", (_, palette) => {
  const mapFills: [string, string][] = [
    ...DIRECTIONS.flatMap((d) => binFills(d).map((c, i): [string, string] => [`${d} bin ${i}`, c])),
    ...TIERS.map((t): [string, string] => [`tier ${t}`, tierFill(t, palette)]),
  ];

  test("every scale has 5 bins and every solid map fill is #rrggbb", () => {
    for (const d of DIRECTIONS) expect(binFills(d)).toHaveLength(5);
    expect(mapFills).toHaveLength(15 + TIERS.length);
    for (const [, fill] of mapFills) expect(fill).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test.each(mapFills)("the outline is at least 3:1 against %s (%s)", (_, fill) => {
    expect(contrastRatio(outlineFor(fill, palette), fill)).toBeGreaterThanOrEqual(3);
  });

  test("the default outline is at least 3:1 against the stage", () => {
    expect(contrastRatio(DEFAULT_OUTLINE, palette.stage)).toBeGreaterThanOrEqual(3);
  });

  test("hatched (missing) counties get an outline that reads against the hatch background", () => {
    expect(
      contrastRatio(outlineFor(HATCH_FILL, palette), palette.hatchBackground),
    ).toBeGreaterThanOrEqual(3);
  });
});

test("the ramp bins and the four colored tiers are the same in every palette", () => {
  const [first, ...rest] = Object.values(PALETTES);
  for (const palette of rest) {
    for (const t of SOLID_TIERS) expect(tierFill(t, palette)).toBe(tierFill(t, first!));
  }
  // The ramps take no palette, so they cannot vary by theme; pin their values.
  expect(binFills("higher_is_worse")).toEqual(["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"]);
  expect(binFills("neutral")).toEqual(["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"]);
  expect(SOLID_TIERS.map((t) => tierFill(t, PALETTES.dark))).toEqual([
    "#ca0020",
    "#f4a582",
    "#92c5de",
    "#0571b0",
  ]);
});

test("the lightest bins and the light 'none' tier keep the grey outline", () => {
  const lightest = DIRECTIONS.map((d) => {
    const bins = binFills(d);
    // higher_is_worse and neutral run light to dark; higher_is_better is reversed.
    return d === "higher_is_better" ? bins[bins.length - 1] : bins[0];
  });
  for (const fill of [...lightest, tierFill("none", PALETTES.light)]) {
    expect(fill).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(outlineFor(fill!, PALETTES.light)).toBe(DEFAULT_OUTLINE);
  }
});

test("a fill that isn't #rrggbb falls back to the default outline, with a dev warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(outlineFor("url(#something-else)", PALETTES.light)).toBe(DEFAULT_OUTLINE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"url(#something-else)"'));
  } finally {
    warn.mockRestore();
  }
});

test("the hatch fill gets no warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    outlineFor(HATCH_FILL, PALETTES.dark);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});
