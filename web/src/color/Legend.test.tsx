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
test("shows Better and Worse for directional, neither for neutral", () => {
  const { unmount } = render(<Legend scale={mk({ low: "Better", high: "Worse" })} unit="percent" />);
  expect(screen.getByText("Better")).toBeInTheDocument();
  expect(screen.getByText("Worse")).toBeInTheDocument();
  unmount();
  render(<Legend scale={mk(null)} unit="percent" />);
  expect(screen.queryByText("Better")).not.toBeInTheDocument();
  expect(screen.queryByText("Worse")).not.toBeInTheDocument();
});

const five = [1, 2, 3, 4, 5].map((n) => ({ color: `#00${n}000`, min: n, max: n + 0.5 }));

test("the ramp lists five bins in ascending order, with the low end label before the first swatch", () => {
  render(<Legend scale={{ fill: () => "#000", bins: five, ends: { low: "Better", high: "Worse" } }} unit="percent" />);
  const ramp = screen.getByTestId("legend-ramp");
  const mins = [...ramp.children].map((li) => li.querySelector(".legend-range")!.textContent);
  expect(mins).toHaveLength(5);
  expect(mins.map((t) => parseFloat(t!))).toEqual([1, 2, 3, 4, 5]);
  const low = document.querySelector('.legend-end[data-end="low"]')!;
  const first = ramp.querySelector(".legend-swatch")!;
  expect(low.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test("with two bins there are two swatches and both end labels", () => {
  render(<Legend scale={mk({ low: "Better", high: "Worse" })} unit="percent" />);
  expect(screen.getByTestId("legend-ramp").querySelectorAll(".legend-swatch")).toHaveLength(2);
  expect(document.querySelector('[data-end="low"]')).toHaveTextContent("Better");
  expect(document.querySelector('[data-end="high"]')).toHaveTextContent("Worse");
});
test("with no ends there are no end labels", () => {
  render(<Legend scale={mk(null)} unit="percent" />);
  expect(document.querySelector("[data-end]")).toBeNull();
});
