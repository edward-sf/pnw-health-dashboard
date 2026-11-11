import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { manifest, values } from "../test/fixtures";
import type { Row } from "./sortRows";
import { CountyTable } from "./CountyTable";

const counties = [
  { fips: "53033", name: "King", state: "WA" },
  { fips: "41051", name: "Multnomah", state: "OR" },
  { fips: "16001", name: "Ada", state: "ID" },
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
];
const rowsFor = (id: string): Row[] =>
  counties.map((c) => ({ ...c, entry: values[id]?.[c.fips] }));
const ind = (id: string) => manifest.indicators.find((x) => x.id === id)!;

function setup(id = "poverty_rate", selected: string | null = null) {
  const onSelect = vi.fn();
  render(
    <CountyTable rows={rowsFor(id)} indicator={ind(id)} selected={selected} onSelect={onSelect} />,
  );
  return onSelect;
}
const bodyNames = () =>
  within(document.querySelector("tbody")!)
    .getAllByRole("row")
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

test("default sort is rank ascending with aria-sort set", () => {
  setup();
  expect(screen.getByRole("columnheader", { name: "Rank" })).toHaveAttribute("aria-sort", "ascending");
  expect(screen.getByRole("columnheader", { name: "County" })).toHaveAttribute("aria-sort", "none");
  expect(bodyNames()[0]).toBe("Aleutians West");
});

test("clicking the active header flips direction; another header starts asc", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Rank" }));
  expect(screen.getByRole("columnheader", { name: "Rank" })).toHaveAttribute("aria-sort", "descending");
  await userEvent.click(screen.getByRole("button", { name: "County" }));
  expect(screen.getByRole("columnheader", { name: "County" })).toHaveAttribute("aria-sort", "ascending");
  expect(screen.getByRole("columnheader", { name: "Rank" })).toHaveAttribute("aria-sort", "none");
  expect(bodyNames()[0]).toBe("Ada");
});

test("a true zero shows 0.0%, not missing, and sorts as a number", async () => {
  setup();
  expect(screen.getByText("0.0%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Value" }));
  expect(bodyNames()[0]).toBe("Ada");
});

test("shows CI as lo–hi, empty when absent", () => {
  setup();
  expect(screen.getByText("9.1–9.9")).toBeInTheDocument();
});

test("neutral indicators have no rank columns and default to value descending", () => {
  setup("pct_asian");
  expect(screen.queryByRole("columnheader", { name: "Rank" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "State rank" })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Value" })).toHaveAttribute("aria-sort", "descending");
  expect(bodyNames()[0]).toBe("King");
});

test("a legacy-only row points to the panel", () => {
  setup();
  expect(screen.getByText("Former-area value in panel")).toBeInTheDocument();
});

test("a row with no data and no legacy says not available", () => {
  setup("median_household_income");
  expect(screen.queryByText("Former-area value in panel")).not.toBeInTheDocument();
});

test("clicking a county name selects it and passes the button", async () => {
  const onSelect = setup();
  const btn = screen.getByRole("button", { name: "King" });
  await userEvent.click(btn);
  expect(onSelect).toHaveBeenCalledWith("53033", btn);
});

test("marks the selected row", () => {
  setup("poverty_rate", "53033");
  expect(screen.getByRole("button", { name: "King" })).toHaveAttribute("aria-current", "true");
});
