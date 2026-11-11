import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { About } from "./About";

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );

test("has the page heading and every section heading", () => {
  renderAbout();
  expect(screen.getByRole("heading", { level: 2, name: "About" })).toHaveAttribute("tabindex", "-1");
  for (const name of ["What this is", "How to use it", "Built with", "Data credits", "Author"]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
  }
});

test("links to the author, repo, licence and the four data sources", () => {
  renderAbout();
  const href = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");
  expect(href("GitHub")).toBe("https://github.com/edward-sf");
  expect(href("LinkedIn")).toBe("https://www.linkedin.com/in/edward-sf");
  expect(href("Source code")).toBe("https://github.com/edward-sf/pnw-health-dashboard");
  expect(href("MIT license")).toBe("https://github.com/edward-sf/pnw-health-dashboard/blob/main/LICENSE");
  expect(href("CDC PLACES")).toBe("https://www.cdc.gov/places/");
  expect(href("County Health Rankings & Roadmaps")).toBe("https://www.countyhealthrankings.org/");
  expect(href("Census ACS")).toBe("https://www.census.gov/programs-surveys/acs");
  expect(href("Census cartographic boundary files")).toBe(
    "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html",
  );
  expect(screen.getByText(/Edward Simpson-Fitzgibbon/)).toBeInTheDocument();
});

test("says the site is not affiliated with the data providers", () => {
  renderAbout();
  expect(screen.getByText(/not affiliated with or endorsed by/)).toBeInTheDocument();
});

test("links to the methodology page inside the app", () => {
  renderAbout();
  expect(screen.getByRole("link", { name: "methodology" })).toHaveAttribute("href", "/methodology");
});

test("the page heading is the route focus target", () => {
  renderAbout();
  expect(screen.getByRole("heading", { level: 2, name: "About" })).toHaveAttribute(
    "data-page-heading",
  );
});

test("names all four states the data covers", () => {
  renderAbout();
  expect(
    screen.getByText(/across Washington, Oregon, Idaho and Alaska/),
  ).toBeInTheDocument();
});
