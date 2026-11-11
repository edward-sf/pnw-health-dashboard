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

test("lists five tiers worse to better with counts, then not enough data", () => {
  render(<ModelLegend counts={counts} />);
  const items = [...document.querySelectorAll(".legend li")].map((li) => li.textContent);
  expect(items).toEqual([
    "Notably worse (0)",
    "Somewhat worse (4)",
    "About as expected (109)",
    "Somewhat better (11)",
    "Notably better (14)",
    "Not enough data (10)",
  ]);
  expect(
    screen.getByText(
      "Compared with what the model expects for counties nationwide with a similar social and economic profile.",
    ),
  ).toBeInTheDocument();
});
