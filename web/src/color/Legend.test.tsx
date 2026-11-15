import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Legend } from "./Legend";
import { type ColorScale } from "./makeColorScale";

const bins = [
  { color: "#fef0d9", min: 1, max: 3 },
  { color: "#b30000", min: 4, max: 9.5 },
];
const mk = (ends: ColorScale["ends"]): ColorScale => ({ fill: () => "#000", bins, ends });

test("shows bin bounds formatted by unit", () => {
  render(<Legend scale={mk(null)} unit="percent" />);
  expect(screen.getByText("1.0% – 3.0%")).toBeInTheDocument();
  expect(screen.getByText("4.0% – 9.5%")).toBeInTheDocument();
});
test("always shows the hatch entry", () => {
  render(<Legend scale={{ fill: () => "#000", bins: [], ends: null }} unit="percent" />);
  expect(screen.getByText("Suppressed or not available")).toBeInTheDocument();
});
test("shows More favorable and Less favorable for directional, neither for neutral", () => {
  const { unmount } = render(<Legend scale={mk({ low: "More favorable", high: "Less favorable" })} unit="percent" />);
  expect(screen.getByText("More favorable")).toBeInTheDocument();
  expect(screen.getByText("Less favorable")).toBeInTheDocument();
  unmount();
  render(<Legend scale={mk(null)} unit="percent" />);
  expect(screen.queryByText("More favorable")).not.toBeInTheDocument();
  expect(screen.queryByText("Less favorable")).not.toBeInTheDocument();
});

const five = [1, 2, 3, 4, 5].map((n) => ({ color: `#00${n}000`, min: n, max: n + 0.5 }));

test("the ramp lists five bins in ascending order, with the low end label before the first swatch", () => {
  render(<Legend scale={{ fill: () => "#000", bins: five, ends: { low: "More favorable", high: "Less favorable" } }} unit="percent" />);
  const ramp = screen.getByTestId("legend-ramp");
  const mins = [...ramp.children].map((li) => li.querySelector(".legend-range")!.textContent);
  expect(mins).toHaveLength(5);
  expect(mins.map((t) => parseFloat(t!))).toEqual([1, 2, 3, 4, 5]);
  const low = document.querySelector('.legend-end[data-end="low"]')!;
  const first = ramp.querySelector(".legend-swatch")!;
  expect(low.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test("with two bins there are two swatches and both end labels", () => {
  render(<Legend scale={mk({ low: "More favorable", high: "Less favorable" })} unit="percent" />);
  expect(screen.getByTestId("legend-ramp").querySelectorAll(".legend-swatch")).toHaveLength(2);
  expect(document.querySelector('[data-end="low"]')).toHaveTextContent("More favorable");
  expect(document.querySelector('[data-end="high"]')).toHaveTextContent("Less favorable");
});
test("with no ends there are no end labels", () => {
  render(<Legend scale={mk(null)} unit="percent" />);
  expect(document.querySelector("[data-end]")).toBeNull();
});

test("per-100k ranges state the unit once and counts use compact bounds", () => {
  const bins = [
    { min: 3315.3, max: 6422.1, color: "#111" },
    { min: 6465.4, max: 7762.3, color: "#222" },
  ];
  const { unmount } = render(<Legend scale={{ fill: () => "#000", bins, ends: null }} unit="rate_per_100k" />);
  expect(screen.getByText("3,315.3 – 6,422.1")).toBeInTheDocument();
  expect(screen.getAllByText(/per 100k/i)).toHaveLength(1);
  unmount();
  const counts = [{ min: 41049, max: 98902, color: "#111" }];
  render(<Legend scale={{ fill: () => "#000", bins: counts, ends: null }} unit="count" />);
  expect(screen.getByText("41K – 98.9K")).toBeInTheDocument();
});
