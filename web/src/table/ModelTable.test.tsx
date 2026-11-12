import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { countyModel } from "../model/modelView";
import { lifeExpectancy as model } from "../test/fixtures";
import { ModelTable } from "./ModelTable";
import type { ModelRow } from "./sortModelRows";

const counties = [
  { fips: "53033", name: "King", state: "WA" },
  { fips: "41051", name: "Multnomah", state: "OR" },
  { fips: "16001", name: "Ada", state: "ID" },
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
];
const rows: ModelRow[] = counties.map((c) => ({
  ...c,
  model: countyModel(model, c.fips),
}));

function setup(selected: string | null = null) {
  const onSelect = vi.fn();
  render(<ModelTable rows={rows} selected={selected} onSelect={onSelect} />);
  return onSelect;
}
const rowOf = (name: string) => screen.getByRole("button", { name }).closest("tr")!;

test("has the model columns, no rank columns, and result ascending by default", () => {
  setup();
  for (const h of ["County", "State", "Life expectancy", "Expected", "Difference", "Result"]) {
    expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
  }
  expect(screen.getByRole("columnheader", { name: "Result" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  expect(screen.getByRole("columnheader", { name: "County" })).toHaveAttribute("aria-sort", "none");
  expect(screen.queryByRole("columnheader", { name: "Rank" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "State rank" })).not.toBeInTheDocument();
  expect(document.querySelector("caption")).toHaveTextContent(
    "Life expectancy compared with expected, by county",
  );
  const first = within(document.querySelector("tbody")!).getAllByRole("row")[0]!;
  expect(first).toHaveTextContent("Multnomah");
});

test("shows actual, expected, signed difference and the result label", () => {
  setup();
  const r = rowOf("King, WA");
  expect(r).toHaveTextContent("80.8 years");
  expect(r).toHaveTextContent("77.1 years");
  expect(r).toHaveTextContent("+3.7 years");
  expect(r).toHaveTextContent("Notably better than expected");
});

test("a county without enough data shows the label and empty numeric cells", () => {
  setup();
  const cells = [...rowOf("Chugach, AK").querySelectorAll("td")].map((c) => c.textContent);
  expect(cells.slice(2)).toEqual(["", "", "", "Not enough data"]);
});

test("clicking a header sorts by it, and clicking again flips", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Difference" }));
  expect(screen.getByRole("columnheader", { name: "Difference" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await userEvent.click(screen.getByRole("button", { name: "Difference" }));
  expect(screen.getByRole("columnheader", { name: "Difference" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  const first = within(document.querySelector("tbody")!).getAllByRole("row")[0]!;
  expect(first).toHaveTextContent("King");
});

test("clicking a county passes its FIPS and the button", async () => {
  const onSelect = setup();
  const btn = screen.getByRole("button", { name: "King, WA" });
  await userEvent.click(btn);
  expect(onSelect).toHaveBeenCalledWith("53033", btn);
});

test("marks the selected row", () => {
  setup("53033");
  expect(screen.getByRole("button", { name: "King, WA" })).toHaveAttribute("aria-current", "true");
});

test("a negative difference uses the true minus, and a near-zero one has no sign", () => {
  const king = countyModel(model, "53033");
  render(
    <ModelTable
      rows={[
        { fips: "1", name: "Below", state: "WA", model: { ...king, residual: -1.24 } },
        { fips: "2", name: "Level", state: "WA", model: { ...king, residual: 0.01 } },
      ]}
      selected={null}
      onSelect={() => {}}
    />,
  );
  expect(within(rowOf("Below, WA")).getByText("\u22121.2 years")).toBeInTheDocument();
  expect(within(rowOf("Level, WA")).getByText("0.0 years")).toBeInTheDocument();
});
