import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import type { PeerRow } from "./buildPeerRows";
import { SimilarCounties } from "./SimilarCounties";

const rows: PeerRow[] = [
  {
    fips: "53033",
    name: "King",
    state: "WA",
    isSelected: true,
    value: 80.8,
    expected: 77.1,
    flag: "notably_better",
  },
  {
    fips: "41051",
    name: "Multnomah",
    state: "OR",
    isSelected: false,
    value: null,
    expected: 78.6,
    flag: "none",
  },
];

function setup(
  props: Partial<React.ComponentProps<typeof SimilarCounties>> = {},
) {
  const onSelect = vi.fn();
  render(
    <MemoryRouter>
      <SimilarCounties
        rows={rows}
        median={{ value: 76, expected: 78 }}
        unit="years"
        mode="model"
        factorCount={9}
        onSelect={onSelect}
        {...props}
      />
    </MemoryRouter>,
  );
  return onSelect;
}

test("shows 'Not available' for a null value", () => {
  setup({
    mode: "values",
    rows: [rows[0]!, rows[1]!],
    median: { value: null },
  });
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
      /Most similar PNW counties on income, poverty, education and six other social and economic measures\./,
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
  [9, "six other"],
  [10, "seven other"],
  [14, "11 other"],
])("derives the other-measure count from %i factors", (factorCount, words) => {
  setup({ factorCount });
  expect(
    screen.getByText(
      new RegExp(`income, poverty, education and ${words} social and economic measures\\.`),
    ),
  ).toBeInTheDocument();
});
