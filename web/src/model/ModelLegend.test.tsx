import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ModelLegend } from "./ModelLegend";

const counts = {
  notably_worse: 0,
  somewhat_worse: 4,
  none: 109,
  somewhat_better: 11,
  notably_better: 14,
  insufficient_data: 10,
};

test("lists five tiers in scale order with counts, then not enough data", () => {
  render(<ModelLegend counts={counts} direction="higher_is_better" />);
  const items = [...document.querySelectorAll(".legend li")].map((li) => li.textContent);
  expect(items).toEqual([
    "Notably lower (0)",
    "Somewhat lower (4)",
    "About as expected (109)",
    "Somewhat higher (11)",
    "Notably higher (14)",
    "Not enough data (10)",
  ]);
  expect(
    screen.getByText(
      "Compared with what the model expects for counties nationwide with a similar social and economic profile.",
    ),
  ).toBeInTheDocument();
});

test("tier names flip with the outcome's direction, and the caption says which colour is favorable", () => {
  render(<ModelLegend counts={counts} direction="higher_is_worse" />);
  const items = [...document.querySelectorAll(".legend li")].map((li) => li.textContent);
  expect(items[0]).toBe("Notably higher (0)");
  expect(items[4]).toBe("Notably lower (14)");
  expect(screen.getByText("Blue: more favorable than expected. Red: less favorable.")).toBeInTheDocument();
});
