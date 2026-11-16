import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import type { ModelPeerData, ModelPeerRow, ValuesPeerData } from "./buildPeerRows";
import type { Indicator } from "../types/generated/manifest";
import { SimilarCounties } from "./SimilarCounties";

const rows: ModelPeerRow[] = [
  {
    kind: "model",
    fips: "53033",
    name: "King",
    state: "WA",
    isSelected: true,
    value: 80.8,
    expected: 77.1,
    flag: "notably_better",
  },
  {
    kind: "model",
    fips: "41051",
    name: "Multnomah",
    state: "OR",
    isSelected: false,
    value: null,
    expected: 78.6,
    flag: "none",
  },
];
const modelData: ModelPeerData = {
  kind: "model",
  rows,
  median: { kind: "model", value: 76, expected: 78 },
};

const LABELS: Record<string, string> = {
  median_household_income: "Median household income",
  poverty_rate: "Poverty rate",
  uninsured_rate: "Uninsured rate",
  bachelors_or_higher: "Bachelor's degree or higher",
  unemployment_rate: "Unemployment rate",
  age_65_plus: "Age 65 and older",
  percent_rural: "Percent rural",
  severe_housing_cost_burden: "Severe housing cost burden",
  broadband_households: "Households with broadband",
  copd: "COPD",
};
const INDICATORS = Object.entries(LABELS).map(([id, label]) => ({ id, label })) as never as Indicator[];
const FEATURES = Object.keys(LABELS).slice(0, 9);

function setup(
  props: Partial<React.ComponentProps<typeof SimilarCounties>> = {},
) {
  const onSelect = vi.fn();
  render(
    <MemoryRouter>
      <SimilarCounties
        data={modelData}
        unit="years"
        direction="higher_is_better"
        features={FEATURES}
        indicators={INDICATORS}
        onSelect={onSelect}
        {...props}
      />
    </MemoryRouter>,
  );
  return onSelect;
}

test("shows 'Not available' for a null value", () => {
  const data: ValuesPeerData = {
    kind: "values",
    rows: rows.map((r) => ({
      kind: "values",
      fips: r.fips,
      name: r.name,
      state: r.state,
      isSelected: r.isSelected,
      value: r.value,
    })),
    median: { kind: "values", value: null },
  };
  setup({ data });
  const row = screen.getByRole("row", { name: /Multnomah/ });
  expect(within(row).getByText("Not available")).toBeInTheDocument();
});

test("Compared with expected has three columns: actual and a short tier with its swatch", () => {
  setup();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["County", "Actual", "Compared"]);
  const king = screen.getByRole("row", { name: /King/ });
  expect(within(king).getByText("80.8 years")).toBeInTheDocument();
  expect(within(king).queryByText("77.1 years")).not.toBeInTheDocument();
  const cell = within(king).getByText("Notably higher").closest("td")!;
  expect(cell.querySelector(".tier-swatch")).toHaveStyle({ background: "#0571b0" });
  expect(within(screen.getByRole("row", { name: /Multnomah/ })).getByText("About as expected")).toBeInTheDocument();
  const median = screen.getByRole("row", { name: /Peer median/ });
  expect(within(median).getByText("76.0 years")).toBeInTheDocument();
  expect(within(median).getAllByRole("cell")).toHaveLength(2);
  expect(within(median).getAllByRole("cell")[1]).toBeEmptyDOMElement();
});

test("the short tier is worded by the outcome's direction", () => {
  setup({ direction: "higher_is_worse" });
  expect(within(screen.getByRole("row", { name: /King/ })).getByText("Notably lower")).toBeInTheDocument();
});

test("clicking a peer calls onSelect with its fips; selected county is not a button", async () => {
  const onSelect = setup();
  await userEvent.click(screen.getByRole("button", { name: "Multnomah, OR" }));
  expect(onSelect).toHaveBeenCalledWith("41051");
  expect(
    screen.queryByRole("button", { name: /King/ }),
  ).not.toBeInTheDocument();
});

const MATCHED = (text: string) => async () => {
  await userEvent.click(screen.getByRole("button", { name: "About similar counties" }));
  expect(await screen.findByText(text)).toBeVisible();
};

test("shows a short basis, with every matching measure and the methodology link behind its ⓘ", async () => {
  setup();
  expect(screen.getByText("Counties with the most similar social and economic profile.")).toBeInTheDocument();
  expect(screen.queryByText(/other social and economic measures/)).not.toBeInTheDocument();
  await MATCHED(
    "Matched on median household income, poverty rate, uninsured rate, bachelor's degree or higher, unemployment rate, age 65 and older, percent rural, severe housing cost burden and households with broadband.",
  )();
  expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/methodology#similar-counties");
  expect(screen.getByRole("heading", { level: 3, name: "Similar counties" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: /Similar counties/ })).toBeInTheDocument();
});

test("shows the state for every row, including the selected county", () => {
  setup();
  expect(screen.getByRole("row", { name: /King, WA/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Multnomah, OR" })).toBeInTheDocument();
});

test("with two features joins them with 'and'", async () => {
  setup({ features: FEATURES.slice(0, 2) });
  await MATCHED("Matched on median household income and poverty rate.")();
});

test("with one feature names just it", async () => {
  setup({ features: ["poverty_rate"] });
  await MATCHED("Matched on poverty rate.")();
});

test("keeps acronyms and proper nouns capitalised and falls back to the id", async () => {
  setup({ features: ["copd", "bachelors_or_higher", "mystery_id"] });
  await MATCHED("Matched on COPD, bachelor's degree or higher and mystery_id.")();
});

test("values mode keeps County and Value", () => {
  const data: ValuesPeerData = {
    kind: "values",
    rows: [{ kind: "values", fips: "53033", name: "King", state: "WA", isSelected: true, value: 9.5 }],
    median: { kind: "values", value: 9.5 },
  };
  setup({ data, unit: "percent" });
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["County", "Value"]);
});

test("a peer with not enough data shows the label without an empty swatch", () => {
  const data: ModelPeerData = {
    ...modelData,
    rows: [modelData.rows[0]!, { ...modelData.rows[1]!, flag: "insufficient_data" }],
  };
  setup({ data });
  const cell = within(screen.getByRole("row", { name: /Multnomah/ })).getByText("Not enough data").closest("td")!;
  expect(cell.querySelector(".tier-swatch")).toBeNull();
});
