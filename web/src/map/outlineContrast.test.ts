import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schemeBlues, schemeOrRd } from "d3-scale-chromatic";
import { expect, test } from "vitest";
import { contrastRatio } from "../color/contrast";
import { tierFill } from "../model/modelView";

test("contrastRatio follows WCAG relative luminance", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  expect(contrastRatio("#ffffff", "#767676")).toBe(contrastRatio("#767676", "#ffffff"));
});

test("contrastRatio rejects anything but #rrggbb", () => {
  expect(() => contrastRatio("#fff", "#000000")).toThrow();
  expect(() => contrastRatio("red", "#000000")).toThrow();
});

// The stroke actually shipped: the `.county` rule in styles.css.
function countyStroke(): string {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const block = /(?:^|\n)\.county\s*\{([^}]*)\}/.exec(css)?.[1];
  const stroke = block && /stroke:\s*(#[0-9a-fA-F]{6})\s*;/.exec(block)?.[1];
  if (!stroke) throw new Error("no #rrggbb stroke in the .county rule");
  return stroke;
}

const PALE_FILLS: [string, string][] = [
  ["the white page", "#ffffff"],
  ["the model 'none' tier", tierFill("none")],
  ["the hatch background", "#f2f2f2"],
  ["the lightest neutral bin", schemeBlues[5]?.[0] ?? ""],
  ["the lightest values bin", schemeOrRd[5]?.[0] ?? ""],
];

test.each(PALE_FILLS)("county outline is at least 3:1 against %s (%s)", (_, fill) => {
  expect(contrastRatio(countyStroke(), fill)).toBeGreaterThanOrEqual(3);
});
