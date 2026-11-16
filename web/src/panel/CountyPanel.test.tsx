import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { countyModel } from "../model/modelView";
import { manifest, lifeExpectancy as model, values } from "../test/fixtures";
import { model as modelFile } from "../test/fixtures/model";
import type { Peers } from "../types";
import { mockMatchMedia } from "../test/matchMedia";
import type { County, Indicator } from "../types";
import { CountyPanel } from "./CountyPanel";

const counties: County[] = [
  { fips: "53033", name: "King", state: "WA" },
  { fips: "02016", name: "Aleutians West", state: "AK" },
  { fips: "02063", name: "Chugach", state: "AK" },
];

function setup(fips: string, indicatorId: string, modelMode = false, peers: Peers = modelFile.peers) {
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
        target={model}
        manifest={manifest}
        values={values}
        modelMode={modelMode}
        peers={peers}
        onSelectCounty={() => {}}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

test("shows the name and state on one line, the value and the rank, and no CI", () => {
  setup("53033", "poverty_rate");
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "King, WA" })).toBeInTheDocument();
  expect(document.querySelector(".panel-state")).toBeNull();
  expect(document.querySelector(".panel-value")).toHaveTextContent("9.5%");
  expect(document.querySelector(".panel-ci")).toBeNull();
  expect(screen.queryByText(/90% CI/)).not.toBeInTheDocument();
  // A screen reader reads the full wording; the short form is shown but hidden from it.
  const ranks = document.querySelector(".panel-ranks")!;
  const label = "2nd most favorable of 2 counties, 2nd of 1 in Washington";
  expect(ranks.querySelector('[aria-hidden="true"]')).toHaveTextContent("2/2 counties (2nd in WA)");
  expect(ranks.querySelector(".visually-hidden")).toHaveTextContent(label);
  expect(ranks).not.toHaveAttribute("aria-label");
  expect(ranks).toHaveAttribute("title", label);
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
});

test("names the measure directly above the value", () => {
  setup("53033", "poverty_rate");
  const measure = screen.getByText("Poverty rate");
  expect(measure.nextElementSibling).toBe(document.querySelector(".panel-value"));
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
        target={model}
        manifest={manifest}
        values={values}
        modelMode={false}
        peers={modelFile.peers}
        onSelectCounty={() => {}}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getAllByText("Suppressed or not available")).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: /methodology/i })[0]).toHaveAttribute(
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
  expect(screen.getAllByRole("link", { name: /methodology/i })[0]).toHaveAttribute(
    "href",
    "/methodology#legacy",
  );
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
});

test("neutral indicator has no ranks", () => {
  setup("02016", "pct_asian");
  // The value also appears in Who lives here and the similar-counties table.
  expect(screen.getAllByText("5.0%")).toHaveLength(3);
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
        target={model}
        manifest={manifest}
        values={values}
        modelMode={false}
        peers={modelFile.peers}
        onSelectCounty={() => {}}
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
  expect(screen.getAllByRole("link", { name: /methodology/i })[0]).toHaveAttribute(
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

describe("phone drawer", () => {
  const indicator = manifest.indicators.find((i) => i.id === "poverty_rate") as Indicator;
  const panel = (fips: string, onClose = () => {}) => (
    <MemoryRouter>
      <CountyPanel
        county={counties.find((c) => c.fips === fips)!}
        indicator={indicator}
        entries={values.poverty_rate!}
        counties={counties}
        modelEntry={countyModel(model, fips)}
        target={model}
        manifest={manifest}
        values={values}
        modelMode={false}
        peers={modelFile.peers}
        onSelectCounty={() => {}}
        focusRequested={false}
        onFocusHandled={() => {}}
        onClose={onClose}
      />
    </MemoryRouter>
  );
  const dialog = () => screen.getByRole("dialog", { name: "County details" });

  test("renders as a drawer with Close and no Expand button on a phone", () => {
    mockMatchMedia(true);
    render(panel("53033"));
    expect(dialog()).toHaveAttribute("data-vaul-drawer");
    expect(dialog()).toHaveClass("county-panel");
    expect(screen.getByRole("heading", { level: 2, name: "King, WA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });

  test("crossing to a wide viewport swaps the drawer for the floating panel and keeps the county", () => {
    const mm = mockMatchMedia(true);
    render(panel("53033"));
    act(() => mm.set(false));
    expect(dialog()).not.toHaveAttribute("data-vaul-drawer");
    expect(screen.getByRole("heading", { level: 2, name: "King, WA" })).toBeInTheDocument();
  });

  test("Escape closes the drawer", async () => {
    mockMatchMedia(true);
    const onClose = vi.fn();
    render(panel("53033", onClose));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("Close closes the drawer", async () => {
    mockMatchMedia(true);
    const onClose = vi.fn();
    render(panel("53033", onClose));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("a wide viewport has no Expand button", () => {
    mockMatchMedia(false);
    render(panel("53033"));
    expect(dialog()).not.toHaveAttribute("data-vaul-drawer");
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });
});

const precedes = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

test("Compared with expected puts the model card before the indicator section", () => {
  setup("53033", "poverty_rate", true);
  const card = screen.getByRole("heading", { name: "Life expectancy model" });
  const measure = document.querySelector(".panel-measure")!;
  expect(precedes(card, measure)).toBe(true);
});

test("Observed keeps the indicator section before the model card", () => {
  setup("53033", "poverty_rate", false);
  const card = screen.getByRole("heading", { name: "Life expectancy model" });
  const measure = document.querySelector(".panel-measure")!;
  expect(precedes(measure, card)).toBe(true);
});

describe("similar counties", () => {
  test.each([false, true])("renders after Who lives here (Compared with expected %s)", (modelMode) => {
    setup("02016", "poverty_rate", modelMode);
    const who = screen.getByRole("heading", { name: "Who lives here" });
    const similar = screen.getByRole("heading", { name: "Similar counties" });
    expect(who.compareDocumentPosition(similar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chugach, AK" })).toBeInTheDocument();
  });

  test("shows a note when there are no peers", () => {
    setup("02016", "poverty_rate", false, { ...modelFile.peers, counties: { "02016": [] } });
    expect(screen.getByText("Not enough data to find similar counties.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Similar counties/ })).not.toBeInTheDocument();
  });
});

// The breakdown moves to the county Atlas page; the panel shows it in neither mode.
test.each([false, true])("no race breakdown in the panel (Compared with expected %s)", (modelMode) => {
  setup("53033", "poverty_rate", modelMode);
  expect(screen.queryAllByRole("region", { name: /^By race and ethnicity/ })).toHaveLength(0);
  expect(document.querySelector(".race-breakdown")).toBeNull();
});

