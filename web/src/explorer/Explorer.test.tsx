import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { HATCH_FILL } from "../color/makeColorScale";
import { manifest as fixtureManifest, model, prematureDeath, strata, topology, values } from "../test/fixtures";
import { PALETTES } from "../color/palette";
import { tierFill } from "../model/modelView";
import { mockMatchMedia } from "../test/matchMedia";
import { Explorer } from "./Explorer";

// The fixture manifest only carries life expectancy; add the other model targets as indicators.
const lifeExpectancy = fixtureManifest.indicators.find((x) => x.id === "life_expectancy")!;
const manifest = {
  ...fixtureManifest,
  indicators: [
    ...fixtureManifest.indicators,
    { ...lifeExpectancy, id: "premature_death", label: "Premature death (years lost)" },
    { ...lifeExpectancy, id: "injury_deaths", label: "Injury deaths" },
  ],
};

function setup(url = "/", data = { manifest, values, topology, model, strata }) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Explorer data={data} />
        ),
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

test("picking an indicator updates the legend and the URL", async () => {
  const router = setup();
  const legend = () => document.querySelector(".legend")!.textContent;
  expect(legend()).toContain("%");
  await userEvent.click(screen.getByRole("button", { name: /^Measure: / }));
  await userEvent.click(screen.getByRole("option", { name: "Median household income" }));
  expect(router.state.location.search).toBe("?i=median_household_income");
  expect(legend()).toContain("$");
  expect(screen.getByRole("button", { name: "Measure: Median household income" })).toBeInTheDocument();
});

test("clicking a county sets c and marks it selected", async () => {
  const router = setup();
  await userEvent.click(screen.getByLabelText("King, WA"));
  expect(router.state.location.search).toBe("?c=53033");
  expect(screen.getByLabelText("King, WA")).toHaveAttribute("aria-current", "true");
});

test("indicator title survives filtering", async () => {
  setup("/?i=poverty_rate");
  await userEvent.click(screen.getByRole("button", { name: "Measure: Poverty rate" }));
  await userEvent.type(screen.getByRole("combobox", { name: "Filter measures" }), "zzz");
  expect(screen.getByRole("heading", { name: "Poverty rate" })).toBeInTheDocument();
});

test("changing indicator re-renders the panel", async () => {
  setup("/?i=poverty_rate&c=02016");
  expect(screen.getByText(/1st of 4 counties/)).toBeInTheDocument();
  expect(screen.getByText("14.2%", { selector: ".panel-value" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Demographics" }));
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
  expect(screen.queryByText("14.2%", { selector: ".panel-value" })).not.toBeInTheDocument();
  expect(screen.getByText("5.0%", { selector: ".panel-value" })).toBeInTheDocument();
});

test("close clears only c", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(router.state.location.search).toBe("?i=poverty_rate");
  expect(screen.queryByRole("dialog", { name: "County details" })).not.toBeInTheDocument();
});

test("Escape clears only c", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  await userEvent.keyboard("{Escape}");
  expect(router.state.location.search).toBe("?i=poverty_rate");
});

test("select from search moves focus to panel heading", async () => {
  const router = setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "Multnomah");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(router.state.location.search).toBe("?c=41051");
  expect(screen.getByRole("heading", { name: "Multnomah" })).toHaveFocus();
});

test("clicking a peer in the panel moves focus to the new county's heading", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  const panel = screen.getByRole("dialog", { name: "County details" });
  await userEvent.click(within(panel).getByRole("button", { name: /^Multnomah/ }));
  expect(router.state.location.search).toContain("c=41051");
  expect(screen.getByRole("heading", { level: 2, name: "Multnomah" })).toHaveFocus();
});

test("close returns focus to opener", async () => {
  setup();
  const input = screen.getByRole("combobox", { name: "Search counties" });
  await userEvent.type(input, "Multnomah");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(input).toHaveFocus();
});

test("close returns focus to the table row button", async () => {
  setup("/?view=table");
  await userEvent.click(screen.getByRole("button", { name: "Ada, ID" }));
  expect(screen.getByRole("heading", { name: "Ada" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Ada, ID" })).toHaveFocus();
});

test("map clicks do not move focus", async () => {
  setup();
  await userEvent.click(screen.getByLabelText("King, WA"));
  expect(screen.getByRole("heading", { name: "King" })).not.toHaveFocus();
});

test("Escape in the open search list closes the list, not the panel", async () => {
  const router = setup("/?c=53033");
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "ada");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(router.state.location.search).toBe("?c=53033");
  await userEvent.keyboard("{Escape}");
  expect(router.state.location.search).toBe("");
});

test("close in table view keeps view", async () => {
  const router = setup("/?view=table&c=53033");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(router.state.location.search).toBe("?view=table");
});

test("toggle switches between map and table and legend is map-only", async () => {
  const router = setup();
  expect(screen.getByRole("radio", { name: "Map" })).toBeChecked();
  await userEvent.click(screen.getByRole("radio", { name: "Table" }));
  expect(router.state.location.search).toBe("?view=table");
  expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
  expect(document.querySelector(".legend")).toBeNull();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(5);
  await userEvent.click(screen.getByRole("radio", { name: "Map" }));
  expect(router.state.location.search).toBe("");
  expect(document.querySelector(".legend")).not.toBeNull();
});

test("back restores view and county", async () => {
  const router = setup("/?c=53033");
  await userEvent.click(screen.getByRole("radio", { name: "Table" }));
  expect(router.state.location.search).toBe("?c=53033&view=table");
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe("?c=53033");
  expect(document.querySelector(".county-map")).not.toBeNull();
  expect(screen.getByRole("heading", { name: "King" })).toBeInTheDocument();
});

const title = () => screen.getByRole("heading", { level: 2, name: "Poverty rate" });

test("shows the indicator description and source under the title", () => {
  setup("/?i=poverty_rate");
  expect(screen.getByText("Share of residents living below the poverty line.")).toBeInTheDocument();
  expect(screen.getByText("Source: Census ACS 5-year, 2023.")).toBeInTheDocument();
});

test("search, close, then a map click leaves the heading unfocused", async () => {
  setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "Multnomah");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await userEvent.click(screen.getByLabelText("King, WA"));
  expect(screen.getByRole("heading", { name: "King" })).not.toHaveFocus();
});

test("a remount from history does not focus the heading", async () => {
  const router = setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "Multnomah");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("heading", { name: "Multnomah" })).not.toHaveFocus();
});

test("searching for the open county focuses the heading again", async () => {
  setup("/?c=41051");
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "Multnomah");
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Multnomah" })).toHaveFocus();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "Multnomah");
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("heading", { name: "Multnomah" })).toHaveFocus();
});

test("table select, switch to map, close focuses the title", async () => {
  setup("/?view=table");
  await userEvent.click(screen.getByRole("button", { name: "Ada, ID" }));
  await userEvent.click(screen.getByRole("radio", { name: "Map" }));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(title()).toHaveFocus();
});

test("indicator change remounts the table, close focuses the new title", async () => {
  setup("/?view=table");
  await userEvent.click(screen.getByRole("button", { name: "Ada, ID" }));
  await userEvent.click(screen.getByRole("radio", { name: "Demographics" }));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("heading", { level: 2, name: "Asian population" })).toHaveFocus();
});

test("close of a map-opened panel focuses the title", async () => {
  setup();
  await userEvent.click(screen.getByLabelText("King, WA"));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(title()).toHaveFocus();
});

test("Compared with expected sets show, fills the map by tier, and shows the model title and source", async () => {
  const router = setup("/?i=life_expectancy");
  await userEvent.click(screen.getByRole("radio", { name: "Compared with expected" }));
  expect(router.state.location.search).toBe("?i=life_expectancy&show=expected");
  expect(screen.getByRole("radio", { name: "Compared with expected" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Observed" })).not.toBeChecked();
  expect(screen.getByLabelText("King, WA").getAttribute("fill")).toBe("#0571b0");
  expect(screen.getByLabelText("Chugach, AK").getAttribute("fill")).toBe(HATCH_FILL);
  expect(
    screen.getByRole("heading", { level: 2, name: "Life expectancy: compared with expected" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Source: County Health Rankings, 2025 release.")).toBeInTheDocument();
  expect(document.querySelectorAll(".legend li")).toHaveLength(6);
});

const twoTargets = {
  ...model,
  targets: {
    ...model.targets,
    premature_death: {
      ...model.targets.life_expectancy!,
      label: "Premature death (years lost)",
      unit: "rate_per_100k" as const,
      direction: "higher_is_worse" as const,
      // Flags differ from life_expectancy's, so the map fill shows which target is rendered.
      counties: {
        ...model.targets.life_expectancy!.counties,
        "53033": { ...model.targets.life_expectancy!.counties["53033"]!, flag: "notably_worse" as const },
      },
    },
  },
};

function setupTwo(url: string) {
  const router = createMemoryRouter(
    [{ path: "/", element: <Explorer data={{ manifest, values, topology, model: twoTargets, strata }} /> }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

test("the Observed and Compared with expected switch only shows for a model target", () => {
  setup("/?i=poverty_rate");
  expect(screen.queryByRole("radiogroup", { name: "Show" })).not.toBeInTheDocument();
  cleanup();
  setup("/?i=life_expectancy");
  expect(screen.getByRole("radiogroup", { name: "Show" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Observed" })).toBeChecked();
});

test("the selected target drives the map fill", () => {
  setupTwo("/?i=life_expectancy&show=expected");
  const king = () => screen.getByLabelText("King, WA").getAttribute("fill");
  expect(king()).toBe(tierFill("notably_better", PALETTES.light));
  cleanup();
  setupTwo("/?i=premature_death&show=expected");
  expect(king()).toBe(tierFill("notably_worse", PALETTES.light));
  expect(king()).not.toBe(tierFill("notably_better", PALETTES.light));
});

test("a pending focus request doesn't fire for a different county", async () => {
  const router = setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "King");
  await act(async () => {
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await router.navigate("/?c=bogus");
  });
  expect(screen.queryByRole("dialog", { name: "County details" })).not.toBeInTheDocument();
  // A URL change, not a select handler, so only the request's FIPS binding keeps it from firing.
  await act(async () => {
    await router.navigate("/?c=41051");
  });
  expect(screen.getByRole("heading", { name: "Multnomah" })).not.toHaveFocus();
});

test("Back to the county a pending request named fulfils it", async () => {
  const router = setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "King");
  await act(async () => {
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await router.navigate("/?c=bogus");
  });
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe("?c=53033");
  expect(screen.getByRole("heading", { name: "King" })).toHaveFocus();
});

test("model table replaces the value table, keeps c and view, and back restores values", async () => {
  const router = setup("/?i=life_expectancy&c=53033&view=table");
  expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Compared with expected" }));
  expect(router.state.location.search).toBe("?i=life_expectancy&c=53033&view=table&show=expected");
  expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Rank" })).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Result" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "King, WA" })).toHaveAttribute("aria-current", "true");
});

test("Compared with expected: hovering King shows the tier tooltip", () => {
  setup("/?i=life_expectancy&show=expected");
  fireEvent.pointerEnter(document.querySelector('path[data-fips="53033"]')!, {
    pointerType: "mouse",
  });
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "King, WA: notably better than expected (+3.7 years)",
  );
});

test("the panel is a dialog and the map stays live: a second county replaces the first", async () => {
  const router = setup("/?i=poverty_rate");
  await userEvent.click(screen.getByLabelText("King, WA"));
  const panel = screen.getByRole("dialog", { name: "County details" });
  expect(within(panel).getByRole("heading", { level: 2, name: "King" })).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Multnomah, OR"));
  expect(router.state.location.search).toBe("?i=poverty_rate&c=41051");
  expect(screen.getAllByRole("dialog", { name: "County details" })).toHaveLength(1);
  expect(
    within(screen.getByRole("dialog", { name: "County details" })).getByRole("heading", {
      level: 2,
      name: "Multnomah",
    }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Multnomah, OR")).toHaveAttribute("aria-current", "true");
});

test("on a non-target measure the card's Outcome select sets t; on a target there is none", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  const panel = screen.getByRole("dialog", { name: "County details" });
  await userEvent.click(within(panel).getByRole("combobox", { name: "Outcome" }));
  await userEvent.click(screen.getByRole("option", { name: "Premature death (years lost)" }));
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033&t=premature_death");
  expect(
    within(panel).getByRole("heading", { level: 3, name: "Premature death (years lost) model" }),
  ).toBeInTheDocument();
  cleanup();
  setup("/?i=life_expectancy&c=53033");
  const targetPanel = screen.getByRole("dialog", { name: "County details" });
  expect(within(targetPanel).queryByRole("combobox", { name: "Outcome" })).not.toBeInTheDocument();
  expect(
    within(targetPanel).getByRole("heading", { level: 3, name: "Life expectancy model" }),
  ).toBeInTheDocument();
});

test("Escape with the measure popover open closes the popover and keeps the county", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  const trigger = screen.getByRole("button", { name: "Measure: Poverty rate" });
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033");
  await userEvent.keyboard("{Escape}");
  expect(router.state.location.search).toBe("?i=poverty_rate");
});

test("Escape with focus on the map closes the panel", async () => {
  const router = setup("/?i=poverty_rate");
  await userEvent.click(screen.getByLabelText("King, WA"));
  screen.getByLabelText("King, WA").focus();
  await userEvent.keyboard("{Escape}");
  expect(router.state.location.search).toBe("?i=poverty_rate");
});

test("phone: the sheet-open class and Escape in the measure list keeps the county", async () => {
  mockMatchMedia(true);
  const router = setup("/?i=poverty_rate&c=53033");
  expect(document.querySelector(".explorer")).toHaveClass("explorer--sheet-open");
  const trigger = screen.getByRole("button", { name: "Measure: Poverty rate" });
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole("combobox", { name: "Filter measures" }));
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033");
});

test("phone: the description waits behind About this measure", async () => {
  mockMatchMedia(true);
  setup("/?i=poverty_rate");
  const text = "Share of residents living below the poverty line.";
  expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.getByText("Source: Census ACS 5-year, 2023.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "About this measure" }));
  expect(screen.getByText(text)).toBeInTheDocument();
});

test("wide viewport: no sheet-open class; the description shows, and in full behind About this measure", async () => {
  mockMatchMedia(false);
  setup("/?i=poverty_rate&c=53033");
  expect(document.querySelector(".explorer")).not.toHaveClass("explorer--sheet-open");
  const text = "Share of residents living below the poverty line.";
  expect(screen.getByText(text)).toHaveClass("indicator-description--clamped");
  await userEvent.click(screen.getByRole("button", { name: "About this measure" }));
  expect(screen.getAllByText(text)).toHaveLength(2);
});

test("wide viewport: the Show switch sits in the title block's slot", () => {
  mockMatchMedia(false);
  setup("/?i=life_expectancy&show=expected");
  const show = screen.getByRole("radiogroup", { name: "Show" });
  expect(show.closest(".show-slot")).not.toBeNull();
  expect(
    screen.getByRole("heading", { level: 2, name: "Life expectancy: compared with expected" }),
  ).toBeInTheDocument();
  cleanup();
  setup("/?i=poverty_rate");
  // The slot is there with nothing in it, so the title block keeps its height.
  expect(document.querySelector(".show-slot")).toBeEmptyDOMElement();
});

test("phone: the Show switch sits under the map, and Compared with expected keeps the label as the heading", () => {
  mockMatchMedia(true);
  setup("/?i=life_expectancy&show=expected");
  const show = screen.getByRole("radiogroup", { name: "Show" });
  expect(show.closest(".title-block")).toBeNull();
  const stage = document.querySelector(".map-stage")!;
  expect(stage.contains(show)).toBe(true);
  expect(
    stage.querySelector(".county-map")!.compareDocumentPosition(show) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "Life expectancy" })).toBeInTheDocument();
});

test("phone: in table view the Show switch sits above the table", () => {
  mockMatchMedia(true);
  setup("/?i=life_expectancy&show=expected&view=table");
  const show = screen.getByRole("radiogroup", { name: "Show" });
  const table = screen.getByRole("table");
  expect(show.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("there is no picker column; the toolbar holds the picker, search and View", () => {
  setup("/?i=poverty_rate");
  expect(document.querySelector(".explorer-picker")).toBeNull();
  const toolbar = document.querySelector<HTMLElement>(".explorer-toolbar")!;
  expect(within(toolbar).getByRole("radiogroup", { name: "Measure category" })).toBeInTheDocument();
  expect(within(toolbar).getByRole("button", { name: "Measure: Poverty rate" })).toBeInTheDocument();
  expect(within(toolbar).getByRole("combobox", { name: "Search counties" })).toBeInTheDocument();
  expect(within(toolbar).getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
});

test("the legend sits inside the map stage", () => {
  setup("/?i=poverty_rate");
  expect(document.querySelector(".map-stage .legend")).not.toBeNull();
});

test("the stage hints at selecting a county until one is open", async () => {
  setup("/?i=poverty_rate");
  expect(screen.getByText("Select a county for its details")).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("King, WA"));
  expect(screen.queryByText("Select a county for its details")).not.toBeInTheDocument();
});

test("the indicator title is the route focus target", () => {
  setup("/?i=poverty_rate");
  expect(screen.getByRole("heading", { level: 2, name: "Poverty rate" })).toHaveAttribute(
    "data-page-heading",
  );
});

test("the first Tab reaches the skip link, and Enter focuses the search", async () => {
  const router = setup("/?i=poverty_rate");
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole("link", { name: "Skip to county search" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("combobox", { name: "Search counties" })).toHaveFocus();
  expect(router.state.location.search).toBe("?i=poverty_rate");
  expect(router.state.location.hash).toBe("");
});

test("the skip link works in model table view with a county open, and keeps c", async () => {
  const router = setup("/?view=table&c=53033&i=life_expectancy&show=expected");
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Skip to county search" }));
  expect(screen.getByRole("combobox", { name: "Search counties" })).toHaveFocus();
  expect(router.state.location.search).toContain("c=53033");
  expect(router.state.location.hash).toBe("");
});

test("the skip link falls back to the plain anchor when the search isn't there", () => {
  setup("/?i=poverty_rate");
  // Stand-in for a render without the search: its id no longer matches the link's target.
  screen.getByRole("combobox", { name: "Search counties" }).id = "elsewhere";
  // fireEvent.click returns false only when a handler called preventDefault().
  expect(fireEvent.click(screen.getByRole("link", { name: "Skip to county search" }))).toBe(true);
});

test("switching to Compared with expected with a county open puts the card first and keeps focus", async () => {
  const router = setup("/?i=life_expectancy&c=53033");
  const user = userEvent.setup();
  const modelButton = screen.getByRole("radio", { name: "Compared with expected" });
  await user.click(modelButton);
  expect(router.state.location.search).toContain("c=53033");
  expect(modelButton).toHaveFocus();
  const panel = screen.getByRole("dialog", { name: "County details" });
  const card = within(panel).getByRole("heading", { name: "Life expectancy model" });
  const measure = panel.querySelector(".panel-measure")!;
  expect(card.compareDocumentPosition(measure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("titles the map and subtitle from the target", () => {
  setup("/?i=premature_death&show=expected");
  expect(
    screen.getByRole("heading", { level: 2, name: "Premature death (years lost): compared with expected" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/^How each county compares on premature death with what the model expects/),
  ).toBeInTheDocument();
});

test("the table, tooltip and card follow the selected target", async () => {
  setup("/?i=premature_death&show=expected&view=table&c=02016");
  expect(screen.getByRole("columnheader", { name: "Premature death (years lost)" })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 3, name: "Premature death (years lost) model" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/Higher is worse for this measure/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/\+1,800 per 100k/).length).toBeGreaterThan(0);
});

test.each([
  ["life_expectancy", "life expectancy"],
  ["premature_death", "premature death"],
  ["injury_deaths", "injury deaths"],
])("the model subtitle for %s reads without parentheses", (id, name) => {
  const injury = { ...prematureDeath, label: "Injury deaths" };
  const withInjury = { ...model, targets: { ...model.targets, injury_deaths: injury } };
  setup(`/?i=${id}&show=expected`, { manifest, values, topology, model: withInjury, strata });
  const text = document.querySelector(".indicator-description")!.textContent!;
  expect(text).toContain(`How each county compares on ${name} with what the model expects`);
  expect(text).not.toContain("(");
});

test("an old model link is rewritten in place", () => {
  const injury = { ...prematureDeath, label: "Injury deaths" };
  const withInjury = { ...model, targets: { ...model.targets, injury_deaths: injury } };
  const router = setup("/?mode=model&t=injury_deaths&c=53033&view=table", {
    manifest,
    values,
    topology,
    model: withInjury,
    strata,
  });
  expect(
    screen.getByRole("heading", { level: 2, name: "Injury deaths: compared with expected" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "County details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "King" })).toBeInTheDocument();
  expect(router.state.location.search).toBe("?c=53033&view=table&i=injury_deaths&show=expected");
  expect(router.state.historyAction).toBe("REPLACE");
});

test("leaving a modelled outcome returns to Observed", async () => {
  const router = setup("/?i=life_expectancy&show=expected");
  await userEvent.click(screen.getByRole("radio", { name: "Indicators" }));
  expect(router.state.location.search).toBe("?i=poverty_rate");
  expect(screen.queryByRole("radiogroup", { name: "Show" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Poverty rate" })).toBeInTheDocument();
});
