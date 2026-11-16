import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { R2Comparison } from "./R2Comparison";

test("labels, formatted values, caption and the fits-less-well sentence", () => {
  render(<R2Comparison national={0.64} pnw={0.41} />);
  expect(screen.getByText("Nationally")).toBeInTheDocument();
  expect(screen.getByText("Pacific Northwest")).toBeInTheDocument();
  expect(screen.getByText("0.64")).toBeInTheDocument();
  expect(screen.getByText("0.41")).toBeInTheDocument();
  expect(
    screen.getByText("R² on counties the model didn't train on"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("The region fits less well than the country."),
  ).toBeInTheDocument();
});

test("drops the sentence when the region fits as well or better", () => {
  const { unmount } = render(<R2Comparison national={0.5} pnw={0.6} />);
  expect(screen.queryByText(/fits less well/)).toBeNull();
  unmount();
  render(<R2Comparison national={0.5} pnw={0.5} />);
  expect(screen.queryByText(/fits less well/)).toBeNull();
});

test("bar widths are r2 percentages, clamped", () => {
  const { container } = render(<R2Comparison national={1.2} pnw={-0.1} />);
  const bars = container.querySelectorAll<HTMLElement>(".r2-bar");
  expect(bars[0]!.style.width).toBe("100%");
  expect(bars[1]!.style.width).toBe("0%");
});
