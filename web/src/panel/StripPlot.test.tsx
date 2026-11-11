import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import * as Plot from "@observablehq/plot";
import { manifest, values } from "../test/fixtures";
import type { Indicator, Unit } from "../types";
import { StripPlot } from "./StripPlot";

vi.mock("@observablehq/plot", () => ({
  plot: vi.fn(() => document.createElementNS("http://www.w3.org/2000/svg", "svg")),
  dot: vi.fn(() => ({})),
}));

const plot = vi.mocked(Plot.plot);
const dot = vi.mocked(Plot.dot);
const county = { fips: "53033", name: "King", state: "WA" };
const poverty = manifest.indicators[0] as Indicator;

function setup(unit: Unit = "percent") {
  render(
    <StripPlot county={county} indicator={{ ...poverty, unit }} entries={values.poverty_rate!} />,
  );
  return plot.mock.calls[0]![0]!;
}

beforeEach(() => {
  plot.mockClear();
  dot.mockClear();
});

test("draws at a fixed width with few compact ticks", () => {
  const options = setup("dollars");
  expect(options.width).toBe(320);
  expect(options.x?.ticks).toBe(4);
  expect((options.x?.tickFormat as (d: number) => string)(72400)).toBe("$72.4K");
});

test.each<[Unit, string | null]>([
  ["years", "years"],
  ["rate_per_100k", "per 100k"],
  ["percent", null],
  ["dollars", null],
  ["count", null],
])("x-axis label for %s", (unit, label) => {
  expect(setup(unit).x?.label).toBe(label);
});

test("spreads dots over a fixed jitter band with no y axis", () => {
  const options = setup();
  expect(options.y).toMatchObject({ axis: null, domain: [-1, 1] });
  const [, base] = dot.mock.calls[0]!;
  expect(base).toMatchObject({ x: "v", y: "jitter", r: 2.5 });
  expect((base as { fillOpacity: number }).fillOpacity).toBeLessThan(1);
});

test("draws the selected county as a larger black mark on top", () => {
  setup();
  expect(dot).toHaveBeenCalledTimes(2);
  const [data, top] = dot.mock.calls[1]!;
  expect(data).toEqual([expect.objectContaining({ fips: "53033" })]);
  expect(top).toMatchObject({ fill: "#000" });
  expect((top as { r: number }).r).toBeGreaterThan(2.5);
});

test("hides the chart from assistive tech and keeps the text summary", () => {
  setup();
  const section = screen.getByRole("region", { name: "Distribution across counties" });
  expect(section.querySelector(".strip-plot-chart")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText(/Higher than \d+ of \d+ counties with data/)).toBeInTheDocument();
});
