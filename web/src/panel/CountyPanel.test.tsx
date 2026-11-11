import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { countyModel } from "../model/modelView";
import { manifest, model, values } from "../test/fixtures";
import { mockMatchMedia } from "../test/matchMedia";
import type { County, Indicator } from "../types";
import { CountyPanel } from "./CountyPanel";

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
        modelEntry={countyModel(model, "02016")}
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
        modelEntry={countyModel(model, "02016")}
        manifest={manifest}
        values={values}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getAllByText("Suppressed or not available")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
    "href",
    "/methodology#suppression",
  );
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
  expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
    "href",
    "/methodology#legacy",
  );
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
});

test("neutral indicator has no ranks", () => {
  setup("02016", "pct_asian");
  // The value also appears in the Who lives here section, so match both.
  expect(screen.getAllByText("5.0%")).toHaveLength(2);
  expect(document.querySelector(".panel-ranks")).toBeNull();
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
        modelEntry={countyModel(model, "02016")}
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
  expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
    "href",
    "/methodology#unreliable",
  );
});

test("shows no caution on a reliable estimate", () => {
  setup("53033", "poverty_rate");
  expect(screen.queryByText(/unreliable/)).not.toBeInTheDocument();
});

test("shows the model card after the strip plot and before Who lives here", () => {
  setup("53033", "poverty_rate");
  const card = screen.getByRole("heading", { level: 3, name: "Life expectancy model" });
  const strip = screen.getByRole("region", { name: "Distribution across counties" });
  const who = screen.getByText(/who lives here/i);
  expect(strip.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(card.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

describe("phone sheet", () => {
  const indicator = manifest.indicators.find((i) => i.id === "poverty_rate") as Indicator;
  const panel = (fips: string, onClose = () => {}) => (
    <MemoryRouter>
      <CountyPanel
        county={counties.find((c) => c.fips === fips)!}
        indicator={indicator}
        entries={values.poverty_rate!}
        counties={counties}
        modelEntry={countyModel(model, fips)}
        manifest={manifest}
        values={values}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={onClose}
      />
    </MemoryRouter>
  );
  const aside = () => screen.getByRole("complementary", { name: "County details" });

  test("renders as a sheet in peek on a phone", () => {
    mockMatchMedia(true);
    render(panel("53033"));
    expect(aside()).toHaveClass("county-panel--sheet");
    expect(aside()).not.toHaveClass("county-panel--expanded");
    const expand = screen.getByRole("button", { name: "Expand" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    const body = document.getElementById(expand.getAttribute("aria-controls")!);
    expect(body).not.toBeNull();
    expect(aside()).toContainElement(body);
    expect(expand.nextElementSibling).toBe(screen.getByRole("button", { name: "Close" }));
  });

  test("Expand toggles aria-expanded, the class and the label", async () => {
    mockMatchMedia(true);
    render(panel("53033"));
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    const collapse = screen.getByRole("button", { name: "Collapse" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(aside()).toHaveClass("county-panel--expanded");
    await userEvent.click(collapse);
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
    expect(aside()).not.toHaveClass("county-panel--expanded");
  });

  test("a different county returns the sheet to peek", async () => {
    mockMatchMedia(true);
    const { rerender } = render(panel("53033"));
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(aside()).toHaveClass("county-panel--expanded");
    rerender(panel("02016"));
    expect(screen.getByRole("heading", { level: 2, name: "Aleutians West" })).toBeInTheDocument();
    expect(aside()).not.toHaveClass("county-panel--expanded");
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
  });

  test("returning to a county after another opens it in peek", async () => {
    mockMatchMedia(true);
    const { rerender } = render(panel("53033"));
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    rerender(panel("02016"));
    rerender(panel("53033"));
    expect(screen.getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
    expect(aside()).not.toHaveClass("county-panel--expanded");
    expect(screen.getByRole("button", { name: "Expand" })).toHaveAttribute("aria-expanded", "false");
  });

  test("going wide and back to a phone reopens the sheet in peek", async () => {
    const mm = mockMatchMedia(true);
    render(panel("53033"));
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    act(() => mm.set(false));
    act(() => mm.set(true));
    expect(aside()).toHaveClass("county-panel--sheet");
    expect(aside()).not.toHaveClass("county-panel--expanded");
  });

  test("crossing to a wide viewport drops the sheet and keeps the county", () => {
    const mm = mockMatchMedia(true);
    render(panel("53033"));
    const heading = screen.getByRole("heading", { level: 2, name: "King" });
    act(() => mm.set(false));
    expect(aside()).not.toHaveClass("county-panel--sheet");
    expect(aside()).not.toHaveClass("county-panel--expanded");
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "King" })).toBe(heading);
  });

  test("Escape closes the sheet", async () => {
    mockMatchMedia(true);
    const onClose = vi.fn();
    render(panel("53033", onClose));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("a wide viewport has no Expand button", () => {
    mockMatchMedia(false);
    render(panel("53033"));
    expect(aside()).not.toHaveClass("county-panel--sheet");
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });
});
