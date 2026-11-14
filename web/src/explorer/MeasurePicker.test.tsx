import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { manifest } from "../test/fixtures";
import type { Indicator } from "../types";
import { MeasurePicker } from "./MeasurePicker";

const base = manifest.indicators[0]!;
const indicators: Indicator[] = [
  ...manifest.indicators,
  { ...base, id: "uninsured", label: "Uninsured adults", category: "Access" },
  { ...base, id: "smoking", label: "Adult smoking", category: "Behaviors" },
  { ...base, id: "diabetes", label: "Diabetes", category: "Outcomes" },
];

function setup(selectedId = "poverty_rate", onSelect = vi.fn()) {
  render(<MeasurePicker indicators={indicators} selectedId={selectedId} onSelect={onSelect} />);
  return onSelect;
}

/** Keeps the selection in state, as the Explorer does through the URL. */
function Stateful({ initial }: { initial: string }) {
  const [id, setId] = useState(initial);
  return <MeasurePicker indicators={indicators} selectedId={id} onSelect={setId} />;
}

const trigger = () => screen.getByRole("button", { name: /^Measure: / });

test("the category of the selected measure is checked", () => {
  setup("poverty_rate");
  const group = screen.getByRole("radiogroup", { name: "Measure category" });
  expect(within(group).getByRole("radio", { name: "Indicators" })).toBeChecked();
  expect(within(group).getByRole("radio", { name: "Outcomes" })).not.toBeChecked();
  expect(trigger()).toHaveAccessibleName("Measure: Poverty rate");
});

test("the list shows only the category's measures, under its headings", async () => {
  setup("poverty_rate");
  await userEvent.click(trigger());
  const list = screen.getByRole("listbox");
  const headings = [...list.querySelectorAll("[cmdk-group-heading]")].map((h) => h.textContent);
  expect(headings).toEqual(["Social & Economic", "Access", "Behaviors"]);
  expect(within(list).getByRole("option", { name: "Uninsured adults" })).toBeInTheDocument();
  expect(within(list).queryByRole("option", { name: "Diabetes" })).not.toBeInTheDocument();
  expect(within(list).queryByRole("option", { name: "Asian population" })).not.toBeInTheDocument();
});

test("typing filters; Enter selects and closes; focus returns to the button", async () => {
  const onSelect = setup("poverty_rate");
  await userEvent.click(trigger());
  const input = screen.getByRole("combobox", { name: "Filter measures" });
  expect(input).toHaveFocus();
  await userEvent.type(input, "income");
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Median household income",
  ]);
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("median_household_income");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(trigger()).toHaveFocus();
});

test("no match shows 'No measures match'", async () => {
  setup();
  await userEvent.click(trigger());
  await userEvent.type(screen.getByRole("combobox", { name: "Filter measures" }), "zzz");
  expect(screen.getByText("No measures match")).toBeInTheDocument();
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});

test("switching category selects its first measure", async () => {
  const onSelect = setup("poverty_rate");
  await userEvent.click(screen.getByRole("radio", { name: "Outcomes" }));
  expect(onSelect).toHaveBeenCalledWith("life_expectancy");
});

test("pressing the checked category again keeps it and selects nothing", async () => {
  const onSelect = setup("poverty_rate");
  await userEvent.click(screen.getByRole("radio", { name: "Indicators" }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: "Indicators" })).toBeChecked();
});

test("switching back selects the measure last viewed there, and clears the filter", async () => {
  render(<Stateful initial="poverty_rate" />);
  await userEvent.click(trigger());
  await userEvent.type(screen.getByRole("combobox", { name: "Filter measures" }), "bach");
  await userEvent.keyboard("{Enter}");
  expect(trigger()).toHaveAccessibleName("Measure: Bachelor's degree or higher");
  await userEvent.click(trigger());
  await userEvent.type(screen.getByRole("combobox", { name: "Filter measures" }), "xyz");
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("radio", { name: "Demographics" }));
  expect(trigger()).toHaveAccessibleName("Measure: Asian population");
  await userEvent.click(screen.getByRole("radio", { name: "Indicators" }));
  expect(trigger()).toHaveAccessibleName("Measure: Bachelor's degree or higher");
  await userEvent.click(trigger());
  expect(screen.getByRole("combobox", { name: "Filter measures" })).toHaveValue("");
});

test("Escape closes the popover and does not bubble", async () => {
  setup();
  await userEvent.click(trigger());
  const seen: boolean[] = [];
  const spy = (e: KeyboardEvent) => seen.push(e.defaultPrevented);
  document.addEventListener("keydown", spy);
  try {
    await userEvent.keyboard("{Escape}");
  } finally {
    document.removeEventListener("keydown", spy);
  }
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(seen.every(Boolean)).toBe(true);
  expect(trigger()).toHaveFocus();
});

for (const close of ["Escape", "an outside click"] as const) {
  test(`closing with ${close} clears the filter, so reopening shows the full list`, async () => {
    setup("poverty_rate");
    await userEvent.click(trigger());
    await userEvent.type(screen.getByRole("combobox", { name: "Filter measures" }), "zzz");
    expect(screen.getByText("No measures match")).toBeInTheDocument();
    if (close === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(trigger());
    expect(screen.getByRole("combobox", { name: "Filter measures" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Uninsured adults" })).toBeInTheDocument();
  });
}
