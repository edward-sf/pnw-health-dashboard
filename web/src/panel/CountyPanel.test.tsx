import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { countyModel } from "../model/modelView";
import { manifest, lifeExpectancy as model, prematureDeath, strata, values } from "../test/fixtures";
import { model as modelFile } from "../test/fixtures/model";
import type { Peers, StrataFile, ValuesFile } from "../types";
import { mockMatchMedia } from "../test/matchMedia";
import type { County, Indicator } from "../types";
import { CountyPanel } from "./CountyPanel";

const targetIndicator = manifest.indicators.find((i) => i.id === "life_expectancy") as Indicator;

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
        strata={strata}
        targetIndicator={targetIndicator}
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

test("shows header, value, CI and ranks", () => {
  setup("53033", "poverty_rate");
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
  expect(screen.getByText("WA")).toBeInTheDocument();
  expect(document.querySelector(".panel-value")).toHaveTextContent("9.5%");
  expect(screen.getByText("90% CI 9.1–9.9")).toBeInTheDocument();
  expect(screen.getByText(/2nd of 2 counties/)).toBeInTheDocument();
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
        strata={strata}
        targetIndicator={targetIndicator}
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
        strata={strata}
        targetIndicator={targetIndicator}
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
        strata={strata}
        targetIndicator={targetIndicator}
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
    expect(screen.getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });

  test("crossing to a wide viewport swaps the drawer for the floating panel and keeps the county", () => {
    const mm = mockMatchMedia(true);
    render(panel("53033"));
    act(() => mm.set(false));
    expect(dialog()).not.toHaveAttribute("data-vaul-drawer");
    expect(screen.getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
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

describe("race breakdown", () => {
  const lifeEntries = {
    "53033": { v: 80.4, lo: 80.1, hi: 80.7, rank: 1, state_rank: 1 },
  };
  const prematureIndicator: Indicator = {
    ...targetIndicator,
    id: "premature_death",
    label: "Premature death",
    unit: "rate_per_100k",
    source_field: "v001_rawvalue",
    direction: "higher_is_worse",
  };
  const prematureEntries = {
    "53033": { v: 5200, lo: 5100, hi: 5300, rank: 1, state_rank: 1 },
  };
  const withValues: ValuesFile = { ...values, life_expectancy: lifeEntries, premature_death: prematureEntries };
  const withStrata: StrataFile = {
    ...strata,
    indicators: {
      ...strata.indicators,
      premature_death: {
        groups: ["white", "black", "hispanic"],
        counties: {
          "53033": {
            white: { v: 5000, lo: 4900, hi: 5100 },
            black: { v: 8100, lo: 7400, hi: 8800 },
            hispanic: null,
          },
        },
      },
    },
  };
  const panel = (opts: {
    indicatorId: string;
    modelMode: boolean;
    target?: Indicator | undefined;
    targetModel?: typeof model;
    fips?: string;
  }) => {
    const indicator =
      opts.indicatorId === "premature_death"
        ? prematureIndicator
        : (manifest.indicators.find((i) => i.id === opts.indicatorId) as Indicator);
    const tm = opts.targetModel ?? model;
    const fips = opts.fips ?? "53033";
    return (
      <MemoryRouter>
        <CountyPanel
          county={counties.find((c) => c.fips === fips)!}
          indicator={indicator}
          entries={withValues[opts.indicatorId]!}
          counties={counties}
          modelEntry={countyModel(tm, fips)}
          target={tm}
          manifest={manifest}
          values={withValues}
          strata={withStrata}
          targetIndicator={"target" in opts ? opts.target : targetIndicator}
          modelMode={opts.modelMode}
          peers={modelFile.peers}
          onSelectCounty={() => {}}
          focusRequested={false}
          onFocusHandled={() => {}}
          onClose={() => {}}
        />
      </MemoryRouter>
    );
  };
  const breakdowns = () => screen.queryAllByRole("region", { name: /^By race and ethnicity/ });

  test("explore mode: breakdown for the selected indicator, under its value", () => {
    render(panel({ indicatorId: "life_expectancy", modelMode: false }));
    const [section] = breakdowns();
    expect(breakdowns()).toHaveLength(1);
    expect(section).toHaveTextContent(/County overall\s*80\.4 years/);
    const value = document.querySelector(".panel-value")!;
    const ci = document.querySelector(".panel-ci")!;
    const ranks = document.querySelector(".panel-ranks")!;
    expect(precedes(value, section!)).toBe(true);
    expect(precedes(ci, section!)).toBe(true);
    expect(precedes(ranks, section!)).toBe(true);
    expect(ranks.nextElementSibling).toBe(section);
    const strip = screen.getByRole("region", { name: "Distribution across counties" });
    expect(precedes(section!, strip)).toBe(true);
  });

  test("explore mode: no breakdown for an indicator without strata", () => {
    render(panel({ indicatorId: "poverty_rate", modelMode: false }));
    expect(breakdowns()).toHaveLength(0);
  });

  test("Compared with expected: breakdown for the target, right after the model card, and none in the indicator section", () => {
    render(panel({ indicatorId: "life_expectancy", modelMode: true }));
    expect(breakdowns()).toHaveLength(1);
    const [section] = breakdowns();
    const card = screen.getByRole("heading", { level: 3, name: "Life expectancy model" });
    const cardSection = card.closest("section")!;
    expect(cardSection.nextElementSibling).toBe(section);
    const measure = document.querySelector(".panel-measure")!;
    expect(precedes(section!, measure)).toBe(true);
    // The overall row repeats the target's value from values.json.
    expect(section).toHaveTextContent(/County overall\s*80\.4 years/);
  });

  test("Compared with expected: the breakdown follows the target, not the explore indicator", () => {
    render(panel({ indicatorId: "poverty_rate", modelMode: true }));
    expect(breakdowns()).toHaveLength(1);
    expect(breakdowns()[0]).toHaveTextContent(/White\s*81\.2 years/);
  });

  test("Compared with expected with a different target re-renders for that target", () => {
    const { rerender } = render(panel({ indicatorId: "poverty_rate", modelMode: true }));
    expect(breakdowns()[0]).toHaveTextContent(/White\s*81\.2 years/);
    rerender(
      panel({
        indicatorId: "poverty_rate",
        modelMode: true,
        target: prematureIndicator,
        targetModel: prematureDeath,
      }),
    );
    expect(breakdowns()).toHaveLength(1);
    const section = breakdowns()[0]!;
    expect(section).toHaveTextContent(/County overall\s*5,200\.0 per 100k/);
    expect(section).toHaveTextContent(/Black\s*8,100\.0 per 100k/);
    expect(section).toHaveTextContent("Not reported: Hispanic.");
    expect(section).not.toHaveTextContent("years");
  });

  test("Compared with expected without a target indicator shows no breakdown", () => {
    render(panel({ indicatorId: "life_expectancy", modelMode: true, target: undefined }));
    expect(breakdowns()).toHaveLength(0);
  });

  // Chugach has no strata entries, so every group is unreported, as in the real data.
  test.each([false, true])(
    "all groups unreported: only the not-reported note (Compared with expected %s)",
    (modelMode) => {
      render(panel({ indicatorId: "life_expectancy", modelMode, fips: "02063" }));
      expect(breakdowns()).toHaveLength(1);
      const section = breakdowns()[0]!;
      expect(within(section).queryAllByRole("listitem")).toHaveLength(0);
      expect(section).not.toHaveTextContent("County overall");
      expect(section).toHaveTextContent("Not reported: White, Black, Hispanic.");
      expect(section).toHaveTextContent(/too few cases to give a stable figure/);
    },
  );
});
