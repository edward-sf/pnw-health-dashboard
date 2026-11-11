import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { manifest, values } from "../test/fixtures";
import type { Indicator } from "../types";
import { CountyPanel, type County } from "./CountyPanel";

const counties: County[] = [
  { fips: "53033", name: "King", state: "WA" },
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
];

function setup(fips: string, indicatorId: string) {
  const indicator = manifest.indicators.find((i) => i.id === indicatorId) as Indicator;
  const county = counties.find((c) => c.fips === fips)!;
  render(
    <MemoryRouter>
      <CountyPanel
        county={county}
        indicator={indicator}
        entries={values[indicatorId]!}
        counties={counties}
        manifest={manifest}
        values={values}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

test("shows header, value, CI and ranks", () => {
  setup("53033", "poverty_rate");
  expect(screen.getByRole("complementary", { name: "County details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
  expect(screen.getByText("WA")).toBeInTheDocument();
  expect(screen.getByText("9.5%")).toBeInTheDocument();
  expect(screen.getByText("90% CI 9.1–9.9")).toBeInTheDocument();
  expect(screen.getByText(/2nd of 2 counties/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
});

test("names the measure directly above the value", () => {
  setup("53033", "poverty_rate");
  const measure = screen.getByText("Poverty rate");
  expect(measure.nextElementSibling).toBe(screen.getByText("9.5%"));
});

test("names the measure directly above the missing-data message", () => {
  setup("02063", "poverty_rate");
  const measure = screen.getByText("Poverty rate");
  expect(measure.nextElementSibling).toHaveTextContent(/Reported only for the former/);
});

test("no CI text when lo is null", () => {
  setup("53033", "pct_asian");
  expect(screen.queryByText(/CI/)).not.toBeInTheDocument();
});

test("suppressed county", () => {
  const indicator = manifest.indicators[0]!;
  render(
    <MemoryRouter>
      <CountyPanel
        county={counties[1]!}
        indicator={indicator}
        entries={{ "02016": { v: null, lo: null, hi: null, rank: null, state_rank: null } }}
        counties={counties}
        manifest={manifest}
        values={values}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getAllByText("Suppressed or not available")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute("href", "/methodology");
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
});

test("legacy county", () => {
  setup("02063", "poverty_rate");
  expect(
    screen.getByText(
      "Reported only for the former Valdez-Cordova Census Area (combined area, CHR 2023): 8.1%",
      { exact: false },
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute("href", "/methodology");
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
});

test("neutral indicator has no ranks", () => {
  setup("02016", "pct_asian");
  // The value also appears in the Who lives here section, so match both.
  expect(screen.getAllByText("5.0%")).toHaveLength(2);
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
});

test("strip plot summary and not-shown note", () => {
  setup("53033", "poverty_rate");
  expect(screen.getByText(/Higher than \d+ of \d+ counties with data/)).toBeInTheDocument();
});

test("strip plot summary shown for a neutral indicator", () => {
  setup("02016", "pct_asian");
  expect(screen.getByText(/Higher than \d+ of \d+ counties with data/)).toBeInTheDocument();
});

test("strip plot summary omitted for a null selection", () => {
  const indicator = manifest.indicators.find((i) => i.id === "poverty_rate") as Indicator;
  render(
    <MemoryRouter>
      <CountyPanel
        county={counties[1]!}
        indicator={indicator}
        entries={{
          "02016": { v: null, lo: null, hi: null, rank: null, state_rank: null },
          "53033": { v: 9.5, lo: null, hi: null, rank: 1, state_rank: 1 },
        }}
        counties={counties}
        manifest={manifest}
        values={values}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByText(/Higher than/)).not.toBeInTheDocument();
  expect(screen.getByText("1 counties not shown (no data)")).toBeInTheDocument();
});

test("cautions about an estimate the source marks unreliable", () => {
  setup("02016", "poverty_rate");
  expect(screen.getByText(/marks this estimate as unreliable/)).toBeInTheDocument();
});

test("shows no caution on a reliable estimate", () => {
  setup("53033", "poverty_rate");
  expect(screen.queryByText(/unreliable/)).not.toBeInTheDocument();
});
