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
