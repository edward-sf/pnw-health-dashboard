import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schemeBlues, schemeOrRd } from "d3-scale-chromatic";
import { expect, test } from "vitest";
import { contrastRatio } from "../color/contrast";
import { HATCH_FILL } from "../color/makeColorScale";
import { DEFAULT_OUTLINE, outlineFor } from "../color/outline";
import { TIERS, tierFill } from "../model/modelView";

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
  const block = /(?:^|\n)\.county\s*\{([^}]*)\}/.exec(css)?.[1];
  const stroke =
    block && /stroke:\s*var\(--county-stroke,\s*(#[0-9a-fA-F]{6})\)\s*;/.exec(block)?.[1];
  if (!stroke) throw new Error("no var(--county-stroke, #rrggbb) stroke in the .county rule");
  return stroke;
}

test("the CSS fallback stroke is the default outline", () => {
  expect(cssFallbackStroke()).toBe(DEFAULT_OUTLINE);
});

const PALE_FILLS: [string, string][] = [
  ["the model 'none' tier", tierFill("none")],
  ["the lightest neutral bin", schemeBlues[5]?.[0] ?? ""],
  ["the lightest values bin", schemeOrRd[5]?.[0] ?? ""],
];

test.each(PALE_FILLS)("pale fills keep the grey outline: %s (%s)", (_, fill) => {
  expect(outlineFor(fill)).toBe(DEFAULT_OUTLINE);
});

test("the default outline is at least 3:1 against the white page", () => {
  expect(contrastRatio(DEFAULT_OUTLINE, "#ffffff")).toBeGreaterThanOrEqual(3);
});

// Every fill the map can draw: both 5-bin ramps and every model tier.
const ALL_FILLS: [string, string][] = [
  ...(schemeOrRd[5] ?? []).map((c, i): [string, string] => [`values bin ${i}`, c]),
  ...(schemeBlues[5] ?? []).map((c, i): [string, string] => [`neutral bin ${i}`, c]),
  ...TIERS.map((t): [string, string] => [`tier ${t}`, tierFill(t)]),
];

test.each(ALL_FILLS)("the outline is at least 3:1 against %s (%s)", (_, fill) => {
  expect(contrastRatio(outlineFor(fill), fill)).toBeGreaterThanOrEqual(3);
});

test("hatched (missing) counties get an outline that reads against the hatch background", () => {
  expect(contrastRatio(outlineFor(HATCH_FILL), "#f2f2f2")).toBeGreaterThanOrEqual(3);
});

test("a fill that isn't #rrggbb falls back to the default outline", () => {
  expect(outlineFor("url(#something-else)")).toBe(DEFAULT_OUTLINE);
});
