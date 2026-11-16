import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { About } from "./About";

const REPO = "https://github.com/edward-sf/pnw-health-dashboard";

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );

const panel = (name: string) =>
  screen.getByRole("heading", { level: 3, name }).closest("article") as HTMLElement;

test("has the page heading, lede and author line", () => {
  renderAbout();
  const h2 = screen.getByRole("heading", { level: 2, name: "A public health atlas, built end to end" });
  expect(h2).toHaveAttribute("tabindex", "-1");
  expect(h2).toHaveAttribute("data-page-heading");
  expect(
    screen.getByText(
      "I built this to show how I take public data to a product people can read: the pipeline, the model, the site and the checks around all three.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("Edward Simpson-Fitzgibbon")).toBeInTheDocument();
});

test("hero actions: primary GitHub button and LinkedIn", () => {
  renderAbout();
  const gh = screen.getByRole("link", { name: "View the source on GitHub" });
  expect(gh).toHaveAttribute("href", REPO);
  for (const c of buttonVariants({ variant: "primary" }).split(" ")) expect(gh).toHaveClass(c);
  expect(gh.querySelector("svg")).not.toBeNull();
  const li = screen.getByRole("link", { name: "LinkedIn" });
  expect(li).toHaveAttribute("href", "https://www.linkedin.com/in/edward-sf");
  expect(li.querySelector("svg")).not.toBeNull();
});

test("four panels with description, chips and proof point", () => {
  renderAbout();
  const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  expect(names).toEqual(["Data pipeline", "Model", "Site and delivery", "Agent workflow"]);
  const expected: Record<string, [string, string[], string]> = {
    "Data pipeline": [
      "Fetches, harmonizes and exports county data from four public sources.",
      ["Python 3.12", "uv", "pandas", "pytest"],
      "Its output is checked against JSON Schemas that the site's types are generated from.",
    ],
    Model: [
      "Expected values for three outcomes, with factor attributions.",
      ["LightGBM", "SHAP", "ridge baseline"],
      "Cross-validated by state, with the weaker regional fit reported on the methodology page.",
    ],
    "Site and delivery": [
      "A map, table and county panel, accessible in both themes.",
      ["React 19", "TypeScript", "Vite", "d3-geo", "Observable Plot", "Playwright"],
      "End-to-end and accessibility tests run on every pull request. Changed tests are repeated under 4× CPU throttling to catch flakiness. GitHub Actions deploys the site.",
    ],
    "Agent workflow": [
      "A small engine that runs each milestone as a graph of scripted checks and AI agent steps.",
      ["Python", "Claude Code", "GitHub Actions"],
      "Agents can merge only into milestone branches, never main. During a run, each merge needs passing gate and review records.",
    ],
  };
  for (const [name, [desc, chips, proof]] of Object.entries(expected)) {
    const p = within(panel(name));
    expect(p.getByText(desc)).toBeInTheDocument();
    expect(p.getAllByRole("listitem").map((li) => li.textContent)).toEqual(chips);
    expect(panel(name).querySelector(".about-proof")?.textContent).toBe(proof);
  }
});

test("the Model proof and the Agent workflow panel link out", () => {
  renderAbout();
  expect(
    within(panel("Model")).getByRole("link", { name: /Cross-validated by state/ }),
  ).toHaveAttribute("href", "/methodology#model-step");
  expect(within(panel("Agent workflow")).getByRole("link")).toHaveAttribute(
    "href",
    `${REPO}/blob/main/workflow/README.md`,
  );
});

test("the explorer line links New to the explorer? to the Explorer", () => {
  renderAbout();
  expect(screen.getByRole("link", { name: "New to the explorer?" })).toHaveAttribute("href", "/");
  expect(
    screen.getByText(/Pick a measure, then select a county on the map or in the table\./),
  ).toBeInTheDocument();
});

test("the footer has the four sources, the disclaimers and the licence", () => {
  renderAbout();
  const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
  expect(href("CDC PLACES")).toBe("https://www.cdc.gov/places/");
  expect(href("County Health Rankings & Roadmaps")).toBe("https://www.countyhealthrankings.org/");
  expect(href("Census ACS")).toBe("https://www.census.gov/programs-surveys/acs");
  expect(href("Census cartographic boundary files")).toBe(
    "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
  );
  expect(href("MIT license")).toBe(`${REPO}/blob/main/LICENSE`);
  expect(screen.getByText(/not affiliated with or endorsed by/)).toBeInTheDocument();
  expect(screen.getByText(/shows associations, not causes/)).toBeInTheDocument();
});

test("the retired sections are gone", () => {
  renderAbout();
  for (const name of ["How to use it", "Built with", "What this is", "Author"]) {
    expect(screen.queryByRole("heading", { name })).toBeNull();
  }
});
