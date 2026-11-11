import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { manifest } from "../test/fixtures";
import { IndicatorPicker } from "./IndicatorPicker";

const setup = (selectedId = "poverty_rate", onSelect = vi.fn()) => {
  render(
    <IndicatorPicker indicators={manifest.indicators} selectedId={selectedId} onSelect={onSelect} />,
  );
  return onSelect;
};

test("groups by category in catalog order", () => {
  setup();
  const groups = screen.getAllByRole("group");
  expect(groups.map((g) => within(g).getByRole("heading").textContent)).toEqual([
    "Social & Economic",
    "Demographics",
  ]);
  expect(within(groups[0]!).getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Poverty rate",
    "Median household income",
  ]);
});

test("each group has an accessible name from its category", () => {
  setup();
  expect(screen.getByRole("group", { name: "Social & Economic" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Demographics" })).toBeInTheDocument();
});

test("filters case-insensitively by label", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Filter indicators"), "INCOME");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Median household income",
  ]);
  expect(screen.queryByText("Demographics")).not.toBeInTheDocument();
});

test("shows 'No indicators match' when nothing matches", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Filter indicators"), "zzz");
  expect(screen.getByText("No indicators match")).toBeInTheDocument();
});

test("marks the selected option aria-pressed", () => {
  setup("pct_asian");
  expect(screen.getByRole("button", { name: "Asian population" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Poverty rate" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("is operable by keyboard", async () => {
  const onSelect = setup();
  await userEvent.tab(); // filter input
  await userEvent.tab(); // first option
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("poverty_rate");
});
