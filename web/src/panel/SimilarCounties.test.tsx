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

test("model mode shows actual, expected and flag; median row has no flag", () => {
  setup();
  const king = screen.getByRole("row", { name: /King/ });
  expect(within(king).getByText("80.8 years")).toBeInTheDocument();
  expect(within(king).getByText("77.1 years")).toBeInTheDocument();
  expect(
    within(king).getByText("Notably better than expected"),
  ).toBeInTheDocument();
  const median = screen.getByRole("row", { name: /Peer median/ });
  expect(within(median).getByText("76.0 years")).toBeInTheDocument();
  expect(within(median).queryByText(/expected$/)).not.toBeInTheDocument();
});

test("clicking a peer calls onSelect with its fips; selected county is not a button", async () => {
  const onSelect = setup();
  await userEvent.click(screen.getByRole("button", { name: "Multnomah, OR" }));
  expect(onSelect).toHaveBeenCalledWith("41051");
  expect(
    screen.queryByRole("button", { name: /King/ }),
  ).not.toBeInTheDocument();
});

test("shows the basis sentence with a link to /methodology#similar-counties", () => {
  setup();
  expect(
    screen.getByText(
      /Most similar PNW counties on median household income, poverty rate, uninsured rate and six other social and economic measures\./,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute(
    "href",
    "/methodology#similar-counties",
  );
  expect(
    screen.getByRole("heading", { level: 3, name: "Similar counties" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("table", { name: /Similar counties/ }),
  ).toBeInTheDocument();
});

test("shows the state for every row, including the selected county", () => {
  setup();
  expect(screen.getByRole("row", { name: /King, WA/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Multnomah, OR" })).toBeInTheDocument();
});

test.each([
  [10, "seven other"],
  [12, "nine other"],
])("derives the other-measure count from %i features", (n, words) => {
  const features = [...FEATURES, "copd", "x1", "x2"].slice(0, n);
  setup({ features });
  expect(
    screen.getByText(
      new RegExp(`uninsured rate and ${words} social and economic measures\\.`),
    ),
  ).toBeInTheDocument();
});

test("with three features names them all and counts none", () => {
  setup({ features: FEATURES.slice(0, 3) });
  expect(
    screen.getByText(
      "Most similar PNW counties on median household income, poverty rate and uninsured rate.",
      { exact: false },
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/other social and economic/)).not.toBeInTheDocument();
});

test("with two features joins them with 'and'", () => {
  setup({ features: FEATURES.slice(0, 2) });
  expect(
    screen.getByText(/on median household income and poverty rate\./),
  ).toBeInTheDocument();
});

test("with one feature names just it", () => {
  setup({ features: ["poverty_rate"] });
  expect(screen.getByText(/on poverty rate\./)).toBeInTheDocument();
});

test("with four features the one other measure is singular", () => {
  setup({ features: FEATURES.slice(0, 4) });
  expect(
    screen.getByText(/uninsured rate and one other social and economic measure\./),
  ).toBeInTheDocument();
});

test("keeps acronyms and proper nouns capitalised and falls back to the id", () => {
  setup({ features: ["copd", "bachelors_or_higher", "mystery_id"] });
  expect(
    screen.getByText(
      /on COPD, bachelor's degree or higher and mystery_id\./,
    ),
  ).toBeInTheDocument();
});
