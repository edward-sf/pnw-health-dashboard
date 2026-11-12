import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { HATCH_FILL } from "../color/makeColorScale";
import { manifest, model, topology, values } from "../test/fixtures";
import { mockMatchMedia } from "../test/matchMedia";
import { Explorer } from "./Explorer";

function setup(url = "/") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Explorer data={{ manifest, values, topology, model }} />
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
  await userEvent.click(screen.getByRole("button", { name: "Median household income" }));
  expect(router.state.location.search).toBe("?i=median_household_income");
  expect(legend()).toContain("$");
  expect(screen.getByRole("button", { name: "Median household income" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("clicking a county sets c and marks it selected", async () => {
  const router = setup();
  await userEvent.click(screen.getByLabelText("King, WA"));
  expect(router.state.location.search).toBe("?c=53033");
  expect(screen.getByLabelText("King, WA")).toHaveAttribute("aria-current", "true");
});

test("indicator title survives filtering", async () => {
  setup("/?i=poverty_rate");
  await userEvent.type(screen.getByLabelText("Filter indicators"), "zzz");
  expect(screen.getByRole("heading", { name: "Poverty rate" })).toBeInTheDocument();
});

test("changing indicator re-renders the panel", async () => {
  setup("/?i=poverty_rate&c=02016");
  expect(screen.getByText(/1st of 4 counties/)).toBeInTheDocument();
  expect(screen.getByText("14.2%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Asian population" }));
  expect(screen.queryByText(/of \d+ counties,/)).not.toBeInTheDocument();
  expect(screen.queryByText("14.2%")).not.toBeInTheDocument();
  expect(screen.getByText("5.0%", { selector: ".panel-value" })).toBeInTheDocument();
});

test("close clears only c", async () => {
  const router = setup("/?i=poverty_rate&c=53033");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(router.state.location.search).toBe("?i=poverty_rate");
  expect(screen.queryByRole("complementary", { name: "County details" })).not.toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Table" }));
  expect(router.state.location.search).toBe("?view=table");
  expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector(".legend")).toBeNull();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(5);
  await userEvent.click(screen.getByRole("button", { name: "Map" }));
  expect(router.state.location.search).toBe("");
  expect(document.querySelector(".legend")).not.toBeNull();
});

test("back restores view and county", async () => {
  const router = setup("/?c=53033");
  await userEvent.click(screen.getByRole("button", { name: "Table" }));
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
  await userEvent.click(screen.getByRole("button", { name: "Map" }));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(title()).toHaveFocus();
});

test("indicator change remounts the table, close focuses the new title", async () => {
  setup("/?view=table");
  await userEvent.click(screen.getByRole("button", { name: "Ada, ID" }));
  await userEvent.click(screen.getByRole("button", { name: "Asian population" }));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("heading", { level: 2, name: "Asian population" })).toHaveFocus();
});

test("close of a map-opened panel focuses the title", async () => {
  setup();
  await userEvent.click(screen.getByLabelText("King, WA"));
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(title()).toHaveFocus();
});

test("Model toggle sets mode, fills the map by tier, and shows the model title and source", async () => {
  const router = setup();
  await userEvent.click(screen.getByRole("button", { name: "Model" }));
  expect(router.state.location.search).toBe("?mode=model");
  expect(screen.getByRole("button", { name: "Model" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Values" })).toHaveAttribute("aria-pressed", "false");
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
    },
  },
};

function setupTwo(url: string) {
  const router = createMemoryRouter(
    [{ path: "/", element: <Explorer data={{ manifest, values, topology, model: twoTargets }} /> }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

test("shows the Outcome select in model mode instead of the indicator picker", async () => {
  const router = setupTwo("/?mode=model&i=pct_asian");
  const select = screen.getByRole("combobox", { name: "Outcome" });
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
    "Life expectancy",
    "Premature death (years lost)",
  ]);
  expect(screen.queryByRole("button", { name: "Median household income" })).not.toBeInTheDocument();
  await userEvent.selectOptions(select, "premature_death");
  expect(router.state.location.search).toBe("?mode=model&i=pct_asian&t=premature_death");
  expect(screen.getByRole("combobox", { name: "Outcome" })).toHaveValue("premature_death");
});

test("hides the Outcome select in values mode", () => {
  setupTwo("/?t=premature_death");
  expect(screen.queryByRole("combobox", { name: "Outcome" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Median household income" })).toBeInTheDocument();
});

test("a pending focus request doesn't fire for a different county", async () => {
  const router = setup();
  await userEvent.type(screen.getByRole("combobox", { name: "Search counties" }), "King");
  await act(async () => {
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await router.navigate("/?c=bogus");
  });
  expect(screen.queryByRole("complementary", { name: "County details" })).not.toBeInTheDocument();
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
  const router = setup("/?c=53033&view=table");
  expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Model" }));
  expect(router.state.location.search).toBe("?c=53033&view=table&mode=model");
  expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Rank" })).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Result" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "King, WA" })).toHaveAttribute("aria-current", "true");
});

test("model mode: hovering King shows the tier tooltip", () => {
  setup("/?mode=model");
  fireEvent.pointerEnter(document.querySelector('path[data-fips="53033"]')!, {
    pointerType: "mouse",
  });
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "King, WA: notably better than expected (+3.7 years)",
  );
});

test("phone: the sheet-open class and Escape in the picker keeps the county", async () => {
  mockMatchMedia(true);
  const router = setup("/?i=poverty_rate&c=53033");
  expect(document.querySelector(".explorer")).toHaveClass("explorer--sheet-open");
  await userEvent.click(screen.getByRole("button", { name: "Indicator: Poverty rate" }));
  await userEvent.click(screen.getByLabelText("Filter indicators"));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Indicator: Poverty rate" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.getByRole("complementary", { name: "County details" })).toBeInTheDocument();
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033");
});

test("wide viewport: no sheet-open class and no picker disclosure", () => {
  mockMatchMedia(false);
  setup("/?i=poverty_rate&c=53033");
  expect(document.querySelector(".explorer")).not.toHaveClass("explorer--sheet-open");
  expect(screen.queryByRole("button", { name: /^Indicator:/ })).not.toBeInTheDocument();
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
  const router = setup("/?view=table&c=53033&mode=model");
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Skip to county search" }));
  expect(screen.getByRole("combobox", { name: "Search counties" })).toHaveFocus();
  expect(router.state.location.search).toContain("c=53033");
  expect(router.state.location.hash).toBe("");
});

test("switching to model mode with a county open puts the card first and keeps focus", async () => {
  const router = setup("/?c=53033");
  const user = userEvent.setup();
  const modelButton = screen.getByRole("button", { name: "Model" });
  await user.click(modelButton);
  expect(router.state.location.search).toContain("c=53033");
  expect(modelButton).toHaveFocus();
  const panel = screen.getByRole("complementary", { name: "County details" });
  const card = within(panel).getByRole("heading", { name: "Life expectancy model" });
  const measure = panel.querySelector(".panel-measure")!;
  expect(card.compareDocumentPosition(measure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
