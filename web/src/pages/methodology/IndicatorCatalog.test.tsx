import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { manifest } from "../../test/fixtures";
import { IndicatorCatalog } from "./IndicatorCatalog";

test("groups the catalog by category", () => {
  render(<IndicatorCatalog indicators={manifest.indicators} />);
  expect(
    screen.getByRole("heading", { level: 4, name: "Indicators" }),
  ).toHaveAttribute("id", "indicators");
  const groups = screen
    .getAllByRole("heading", { level: 5 })
    .map((h) => h.textContent);
  expect(groups).toEqual(["Outcomes", "Social & Economic", "Demographics"]);
  const social = screen.getByRole("table", { name: "Social & Economic" });
  const poverty = within(social).getByRole("row", { name: /Poverty rate/ });
  expect(poverty).toHaveTextContent("lower is more favorable");
  expect(poverty).toHaveTextContent(
    "Census American Community Survey (5-year), 2023",
  );
  expect(poverty).toHaveTextContent(
    "Share of residents living below the poverty line.",
  );
  expect(within(social).getAllByRole("row")).toHaveLength(4);
  const demo = screen.getByRole("table", { name: "Demographics" });
  expect(demo).toHaveTextContent("no direction");
  expect(screen.getByRole("table", { name: "Outcomes" })).toHaveTextContent(
    "higher is more favorable",
  );
});

test("shows Behaviors as Health behaviors, keeping the heading id, and the favorable-end intro", () => {
  const smoking = {
    ...manifest.indicators[0]!,
    id: "smoking",
    label: "Adult smoking",
    category: "Behaviors" as const,
  };
  render(<IndicatorCatalog indicators={[...manifest.indicators, smoking]} />);
  expect(
    screen.getByRole("heading", { level: 5, name: "Health behaviors" }),
  ).toHaveAttribute("id", "indicators-behaviors");
  expect(document.body.textContent).toContain(
    "the more favorable end reads the same way on every map",
  );
});

test("names the first three indicators and folds the full table", () => {
  render(<IndicatorCatalog indicators={manifest.indicators} />);
  const social = manifest.indicators.filter(
    (i) => i.category === "Social & Economic",
  );
  const names = social.slice(0, 3).map((i) => i.label);
  const text = document.body.textContent ?? "";
  expect(text).toMatch(/Including [^.]+\./);
  for (const n of names) expect(text).toContain(n);
  const summary = screen.getByText(`Show all ${social.length} indicators`);
  const fold = summary.closest("details")!;
  expect(fold).not.toHaveAttribute("open");
  expect(fold).toContainElement(
    screen.getByRole("table", { name: "Social & Economic" }),
  );
});
