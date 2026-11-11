import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { IndicatorCatalog } from "./IndicatorCatalog";

test("groups the catalog by category", () => {
  render(<IndicatorCatalog indicators={manifest.indicators} />);
  expect(screen.getByRole("heading", { level: 2, name: "Indicators" })).toHaveAttribute(
    "id",
    "indicators",
  );
  const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  expect(groups).toEqual(["Outcomes", "Social & Economic", "Demographics"]);
  const social = screen.getByRole("table", { name: "Social & Economic" });
  const poverty = within(social).getByRole("row", { name: /Poverty rate/ });
  expect(poverty).toHaveTextContent("higher is worse");
  expect(poverty).toHaveTextContent("Census American Community Survey (5-year), 2023");
  expect(poverty).toHaveTextContent("Share of residents living below the poverty line.");
  expect(within(social).getAllByRole("row")).toHaveLength(4);
  const demo = screen.getByRole("table", { name: "Demographics" });
  expect(demo).toHaveTextContent("no direction");
  expect(screen.getByRole("table", { name: "Outcomes" })).toHaveTextContent("higher is better");
});
