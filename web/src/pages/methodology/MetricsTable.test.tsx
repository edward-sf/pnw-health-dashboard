import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { lifeExpectancy as model } from "../../test/fixtures";
import { MetricsTable } from "./MetricsTable";

test("renders a captioned table with two rows per model", () => {
  render(
    <MetricsTable
      caption="Accuracy"
      rows={[
        { model: "Ridge", ...model.metrics.ridge },
        { model: "LightGBM", ...model.metrics.lightgbm },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "Accuracy" });
  const headers = within(table)
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
  expect(headers).toEqual(["Model", "Area", "R²", "RMSE", "MAE", "Counties"]);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((r) => r.textContent)).toEqual([
    "RidgeUnited States0.751.701.303,000",
    "RidgePacific Northwest0.651.801.40139",
    "LightGBMUnited States0.801.501.103,000",
    "LightGBMPacific Northwest0.701.601.20139",
  ]);
});

test("the scrolling wrapper is a named, focusable region", () => {
  render(<MetricsTable caption="Accuracy" rows={[]} />);
  const region = screen.getByRole("region", { name: "Accuracy" });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region).toContainElement(screen.getByRole("table", { name: "Accuracy" }));
});

test("rows with a target add a Target column, one block per target and model", () => {
  render(
    <MetricsTable
      caption="By outcome"
      rows={[
        {
          target: "Life expectancy",
          model: "LightGBM",
          ...model.metrics.lightgbm,
        },
        {
          target: "Premature death",
          model: "LightGBM",
          ...model.metrics.lightgbm,
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "By outcome" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Outcome", "Model", "Area", "R²", "RMSE", "MAE", "Counties"]);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(4);
  expect(rows[0]?.textContent).toBe("Life expectancyLightGBMUnited States0.801.501.103,000");
});
