import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { buildShapBars } from "../model/buildShapBars";
import { manifest, lifeExpectancy as model } from "../test/fixtures";
import { ShapBars } from "./ShapBars";

const bars = buildShapBars(model.counties["53033"]!, manifest.indicators, "years");

test("bars follow buildShapBars order with All other factors last, in one neutral fill", () => {
  // The fill is the --chart-muted token, applied by the .shap-bar class, so it follows the theme.
  const { container } = render(<ShapBars bars={bars} />);
  const groups = [...container.querySelectorAll("svg g")];
  expect(groups.map((g) => g.getAttribute("data-key"))).toEqual(bars.map((b) => b.key));
  expect(groups.at(-1)!.textContent).toContain("All other factors");
  const rects = container.querySelectorAll("rect.shap-bar");
  expect(rects).toHaveLength(bars.length);
  for (const r of rects) expect(r).not.toHaveAttribute("fill");
});

test("direction is shown by side of the zero rule", () => {
  const { container } = render(<ShapBars bars={bars} />);
  const zero = Number(container.querySelector(".shap-zero")!.getAttribute("x1"));
  const rects = [...container.querySelectorAll("rect.shap-bar")];
  bars.forEach((b, i) => {
    const x = Number(rects[i]!.getAttribute("x"));
    const w = Number(rects[i]!.getAttribute("width"));
    if (b.contribution < 0) expect(x + w).toBeLessThanOrEqual(zero);
    else expect(x).toBeGreaterThanOrEqual(zero);
  });
});

test("each bar shows its label and value as visible text", () => {
  const { container } = render(<ShapBars bars={bars} />);
  const svgText = container.querySelector("svg")!.textContent!;
  expect(svgText).toContain("Bachelor's degree or higher: 43.0%");
  expect(svgText).toContain("+2.58 years");
  expect(svgText).toContain("−0.68 years");
  expect(container.querySelectorAll(".shap-value")).toHaveLength(bars.length);
});

test("the hidden list separates label and value with a comma", () => {
  const { container } = render(<ShapBars bars={bars} />);
  const items = [...container.querySelectorAll(".visually-hidden li")].map((l) => l.textContent);
  expect(items[0]).toBe("Bachelor's degree or higher: 43.0%, +2.58 years");
});

test("the zero rule is drawn per bar row, not through label text", () => {
  const { container } = render(<ShapBars bars={bars} />);
  const rules = container.querySelectorAll(".shap-zero");
  expect(rules).toHaveLength(bars.length);
  rules.forEach((r, i) => {
    expect(Number(r.getAttribute("y1"))).toBe(i * 38 + 18 - 2);
    expect(Number(r.getAttribute("y2"))).toBe(i * 38 + 18 + 14 + 2);
  });
});
