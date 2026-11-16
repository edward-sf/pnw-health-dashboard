import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { manifest, lifeExpectancy as model, prematureDeath } from "../test/fixtures";
import type { CountyModel, Flag, TargetModel } from "../types";
import { ModelCard } from "./ModelCard";
import { rangeDomain } from "./ResidualRange";

const king = { fips: "53033", name: "King", state: "WA" };
const aleutians = { fips: "02016", name: "Aleutians West", state: "AK" };

function renderCard(entry: CountyModel, county = king, target: TargetModel = model) {
  return render(
    <MemoryRouter>
      <ModelCard county={county} entry={entry} indicators={manifest.indicators} target={target} />
    </MemoryRouter>,
  );
}

test("King: three figures, badge, range ⓘ and associated factors", async () => {
  const { container } = renderCard(model.counties["53033"]!);
  expect(screen.getByRole("heading", { level: 3, name: "Life expectancy model" })).toBeInTheDocument();
  expect(screen.queryByText("How this county compares")).toBeNull();
  expect(screen.queryByText("Figures are rounded.")).toBeNull();
  expect(screen.queryByText(/starting point/)).toBeNull();
  expect([...container.querySelectorAll(".model-figures dt")].map((d) => d.textContent)).toEqual([
    "Actual",
    "Expected",
    "Difference",
  ]);
  expect([...container.querySelectorAll(".model-figures dd")].map((d) => d.textContent)).toEqual([
    "80.8 years",
    "77.1 years",
    "+3.7 years",
  ]);
  expect(screen.getByText("Notably higher than expected")).toBeInTheDocument();
  // The range explanation waits behind the heading's ⓘ.
  const range =
    "A difference beyond ±2.4 years is flagged as somewhat higher or lower, and beyond ±3.4 years as notably. These ranges allow for the model's typical error and this county's own measurement uncertainty.";
  expect(screen.queryByText(range)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "About the Life expectancy model" }));
  expect(await screen.findByText(range)).toBeVisible();
  // Associated factors, with both explanations behind its ⓘ and none below the bars.
  expect(screen.getByRole("heading", { level: 4, name: "Associated factors" })).toBeInTheDocument();
  expect(screen.queryByText(/Some factors stand in for others/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "About associated factors" }));
  expect(
    await screen.findByText(
      "They describe what the model expects for a county with this profile; they don't explain the difference above.",
    ),
  ).toBeVisible();
  expect(screen.getByText(/^Some factors stand in for others the model doesn't see\./)).toBeVisible();
  expect(screen.getAllByText(/All other factors/).length).toBeGreaterThan(0);
});

test("null se uses the typical-county wording", async () => {
  renderCard(model.counties["16001"]!, { fips: "16001", name: "Ada", state: "ID" });
  await userEvent.click(screen.getByRole("button", { name: "About the Life expectancy model" }));
  expect(
    await screen.findByText(
      /and a typical county's measurement uncertainty, since this county's estimate has no confidence interval\.$/,
    ),
  ).toBeInTheDocument();
});

test("no model result: the heading keeps its ⓘ, with no figures, chart or factors", () => {
  const { container } = renderCard(model.counties["02063"]!, { fips: "02063", name: "Chugach", state: "AK" });
  expect(
    screen.getByText(
      /The model has no result for this county because its life expectancy figure isn't reported\./,
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute(
    "href",
    "/methodology#no-result",
  );
  expect(screen.getByRole("button", { name: "About the Life expectancy model" })).toBeInTheDocument();
  expect(container.querySelector(".model-figures")).toBeNull();
  expect(container.querySelector(".residual-range")).toBeNull();
  expect(screen.queryByText(/Associated factors/)).not.toBeInTheDocument();
});

test("rangeDomain covers the residual and pads the thresholds", () => {
  expect(rangeDomain(11.8, 3.37)).toBeGreaterThanOrEqual(11.8);
  expect(rangeDomain(1, 3.37)).toBe(3.37 * 1.15);
});

test("wording guard: no driver, cause or because of in any tier", () => {
  const base = model.counties["53033"]!;
  const flags: Flag[] = [
    "notably_worse",
    "somewhat_worse",
    "none",
    "somewhat_better",
    "notably_better",
    "insufficient_data",
  ];
  for (const flag of flags) {
    const entry: CountyModel =
      flag === "insufficient_data" ? model.counties["02063"]! : { ...base, flag };
    const { container, unmount } = renderCard(entry);
    expect(container.textContent).not.toMatch(/\bdrivers?\b|\bcause[sd]?\b|because of/i);
    unmount();
  }
});

test("the card colours factor bars by the outcome's direction", () => {
  // King's life expectancy factors include positive contributions, which are favorable there.
  const { container, unmount } = renderCard(model.counties["53033"]!);
  const fills = () =>
    [...container.querySelectorAll(".model-factors rect.shap-bar[fill]")].map((r) => r.getAttribute("fill"));
  expect(fills()).toContain("#0571b0");
  unmount();
  // For premature death a positive contribution is the less favorable way, so the same sign is red.
  const base = prematureDeath.counties["02016"]!;
  const entry = {
    ...base,
    shap: [
      { feature: "poverty_rate", value: 14.2, contribution: 500 },
      { feature: "median_household_income", value: 72000, contribution: -300 },
    ],
  };
  const worse = renderCard(entry, aleutians, prematureDeath);
  const bars = [...worse.container.querySelectorAll(".model-factors g")];
  expect(bars.filter((g) => g.querySelector("rect.shap-bar[fill]")).length).toBeGreaterThan(0);
  for (const g of bars) {
    const rect = g.querySelector("rect.shap-bar")!;
    const value = g.querySelector(".shap-value")!.textContent!;
    if (!rect.hasAttribute("fill")) continue;
    expect(rect.getAttribute("fill")).toBe(value.startsWith("+") ? "#ca0020" : "#0571b0");
  }
});

test("no proxy note sits below the bars any more; it is behind the factors ⓘ", () => {
  const { container } = renderCard(model.counties["53033"]!);
  expect(container.querySelector(".model-factors-note")).toBeNull();
});

const NOTE = "Lower is more favorable for this measure, so a positive difference is less favorable than expected.";

test("heads the card with the target label", () => {
  renderCard(prematureDeath.counties["02016"]!, aleutians, prematureDeath);
  expect(
    screen.getByRole("heading", { level: 3, name: "Premature death (years lost) model" }),
  ).toBeInTheDocument();
});

test("formats actual and expected in the target unit", async () => {
  const { container } = renderCard(prematureDeath.counties["02016"]!, aleutians, prematureDeath);
  expect([...container.querySelectorAll(".model-figures dd")].map((d) => d.textContent)).toEqual([
    "8,800 per 100k",
    "7,000 per 100k",
    "+1,800 per 100k",
  ]);
  expect(container.textContent).not.toMatch(/\d years/);
  await userEvent.click(screen.getByRole("button", { name: "About the Premature death (years lost) model" }));
  expect(await screen.findByText(/beyond ±1,200 per 100k is flagged/)).toBeVisible();
});

test("adds the direction note for higher_is_worse only", () => {
  const base = prematureDeath.counties["02016"]!;
  const entry = {
    ...base,
    shap: [
      { feature: "poverty_rate", value: 14.2, contribution: 500 },
      { feature: "median_household_income", value: 72000, contribution: -300 },
    ],
  };
  const worse = renderCard(entry, aleutians, prematureDeath);
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  worse.unmount();
  renderCard(model.counties["53033"]!);
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});

test("names the chosen target when the county has no result", () => {
  renderCard(prematureDeath.counties["16001"]!, { fips: "16001", name: "Ada", state: "ID" }, prematureDeath);
  expect(
    screen.getByText(
      /because its premature death figure isn't reported\./,
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});

const injuryDeaths: TargetModel = { ...prematureDeath, label: "Injury deaths" };

test.each([
  ["Life expectancy", model],
  ["Premature death (years lost)", prematureDeath],
  ["Injury deaths", injuryDeaths],
])("the no-result sentence reads naturally for %s", (_label, target) => {
  const entry = { ...prematureDeath.counties["16001"]! };
  const { container } = renderCard(entry, { fips: "16001", name: "Ada", state: "ID" }, target);
  const text = container.querySelector(".model-none")!.textContent!;
  expect(text).toMatch(/because its .+ figure isn't reported\./);
  expect(text).not.toContain("(");
  expect(text).not.toMatch(/deaths isn't/);
});

const targets = [
  { id: "life_expectancy", label: "Life expectancy" },
  { id: "premature_death", label: "Premature death (years lost)" },
  { id: "injury_deaths", label: "Injury deaths" },
];

test("with targets, an Outcome select changes the target", async () => {
  const onTargetChange = vi.fn();
  render(
    <MemoryRouter>
      <ModelCard
        county={king}
        entry={model.counties["53033"]!}
        indicators={manifest.indicators}
        target={model}
        targets={targets}
        onTargetChange={onTargetChange}
      />
    </MemoryRouter>,
  );
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(select).toHaveTextContent("Life expectancy");
  const heading = screen.getByRole("heading", { level: 3, name: "Life expectancy model" });
  expect(heading.closest(".model-card-heading")).toContainElement(select);
  await userEvent.click(select);
  await userEvent.click(screen.getByRole("option", { name: "Injury deaths" }));
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith("injury_deaths");
});

test("without targets there is no Outcome select", () => {
  renderCard(model.counties["53033"]!);
  expect(screen.queryByRole("combobox", { name: "Outcome" })).not.toBeInTheDocument();
});
