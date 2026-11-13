import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { manifest, model, strata, topology, values } from "./test/fixtures";

function LocationProbe({ onChange }: { onChange: (search: string) => void }) {
  onChange(useLocation().search);
  return null;
}

const bodies: Record<string, unknown> = {
  "manifest.json": manifest,
  "values.json": values,
  "counties.topojson": topology,
  "model.json": model,
  "strata.json": strata,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(bodies[url.split("/").pop() as string])),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.title = "";
});

describe("App", () => {
  it("renders the site title and then the loaded data", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "PNW Health Dashboard",
    );
    expect(await screen.findByRole("group", { name: "County map" })).toBeInTheDocument();
  });

  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

  it("/methodology renders the page once the data loads", async () => {
    at("/methodology");
    expect(
      screen.getByRole("heading", { level: 2, name: "Methodology" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "At a glance" })).toBeInTheDocument();
  });

  it("/about renders while the data fails to load", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    at("/about");
    expect(
      screen.getByRole("heading", { level: 2, name: "About" }),
    ).toBeInTheDocument();
  });

  it("a load that fails after navigating to the Explorer focuses the error heading", async () => {
    let fail: (e: Error) => void = () => {};
    const pending = new Promise<Response>((_, reject) => (fail = reject));
    vi.stubGlobal("fetch", vi.fn(() => pending));
    const user = userEvent.setup();
    at("/about");
    await user.click(screen.getByRole("link", { name: "Explorer" }));
    expect(screen.getByText("Loading data…")).toBeInTheDocument();
    fail(new Error("offline"));
    expect(
      await screen.findByRole("heading", { name: "Couldn't load the data" }),
    ).toHaveFocus();
  });

  // fetch rejects until `heal()`; then it serves the fixtures.
  const flakyFetch = () => {
    let ok = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        ok
          ? new Response(JSON.stringify(bodies[url.split("/").pop() as string]))
          : Promise.reject(new Error("offline")),
      ),
    );
    return () => (ok = true);
  };

  it("Try again on the Explorer focuses the Explorer heading once the data loads", async () => {
    const heal = flakyFetch();
    const user = userEvent.setup();
    at("/");
    const retry = await screen.findByRole("button", { name: "Try again" });
    heal();
    await user.click(retry);
    const title = await screen.findByRole("heading", { level: 2, name: "Poverty rate" });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("Try again that fails again focuses the new error heading", async () => {
    flakyFetch();
    const user = userEvent.setup();
    at("/");
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    const heading = await screen.findByRole("heading", { name: "Couldn't load the data" });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("Try again on Methodology focuses the Methodology heading", async () => {
    const heal = flakyFetch();
    const user = userEvent.setup();
    at("/methodology");
    const retry = await screen.findByRole("button", { name: "Try again" });
    heal();
    await user.click(retry);
    await screen.findByRole("heading", { name: "At a glance" });
    expect(screen.getByRole("heading", { level: 2, name: "Methodology" })).toHaveFocus();
  });

  it("an unknown path redirects to the explorer", async () => {
    at("/nope");
    expect(await screen.findByRole("group", { name: "County map" })).toBeInTheDocument();
  });

  it("the Explorer nav link restores the Explorer query (#85)", async () => {
    const user = userEvent.setup();
    let search = "";
    render(
      <MemoryRouter initialEntries={["/?i=poverty_rate&c=53033&mode=model&view=table"]}>
        <App />
        <LocationProbe onChange={(s) => (search = s)} />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 2, name: "Life expectancy: compared with expected" });
    await user.click(
      within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Methodology" }),
    );
    expect(search).toBe("");
    await user.click(screen.getByRole("link", { name: "Explorer" }));
    expect(search).toBe("?c=53033&view=table&i=life_expectancy&show=expected");
  });

  it("nav links reach each route", async () => {
    const user = userEvent.setup();
    at("/");
    await screen.findByRole("group", { name: "County map" });
    await user.click(screen.getByRole("link", { name: "Methodology" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Methodology" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "About" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Explorer" }));
    expect(await screen.findByRole("group", { name: "County map" })).toBeInTheDocument();
  });

  it.each([
    ["/", "PNW Health Dashboard"],
    ["/methodology", "Methodology · PNW Health Dashboard"],
    ["/about", "About · PNW Health Dashboard"],
  ])("%s sets the page title", async (path, title) => {
    at(path);
    await screen.findAllByRole("heading", { level: 2 });
    expect(document.title).toBe(title);
  });

  it("the header holds the site heading and nav; main holds neither", async () => {
    at("/about");
    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const h1 = screen.getByRole("heading", { level: 1, name: "PNW Health Dashboard" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(header).toContainElement(h1);
    expect(header).toContainElement(nav);
    expect(main).not.toContainElement(h1);
    expect(main).not.toContainElement(nav);
    expect(main).toContainElement(screen.getByRole("heading", { level: 2, name: "About" }));
  });

  it("the active nav link has aria-current=page", async () => {
    const user = userEvent.setup();
    at("/methodology");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const link = (name: string) => within(nav).getByRole("link", { name });
    expect(link("Methodology")).toHaveAttribute("aria-current", "page");
    expect(link("Explorer")).not.toHaveAttribute("aria-current");
    expect(link("About")).not.toHaveAttribute("aria-current");
    await user.click(link("About"));
    expect(link("About")).toHaveAttribute("aria-current", "page");
    expect(link("Methodology")).not.toHaveAttribute("aria-current");
  });

  it("the Explorer link is current on the Explorer with a query", async () => {
    at("/?i=poverty_rate");
    await screen.findByRole("group", { name: "County map" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Explorer" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("the first load does not move focus", async () => {
    at("/about");
    expect(document.body).toHaveFocus();
  });

  it("clicking About from the Explorer focuses the About heading", async () => {
    const user = userEvent.setup();
    at("/");
    await screen.findByRole("group", { name: "County map" });
    await user.click(screen.getByRole("link", { name: "About" }));
    expect(screen.getByRole("heading", { level: 2, name: "About" })).toHaveFocus();
    await user.click(screen.getByRole("link", { name: "Explorer" }));
    expect(screen.getByRole("heading", { level: 2, name: "Poverty rate" })).toHaveFocus();
  });

  it("/methodology#legacy keeps focus on the hash target", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <App />
        <Link to="/methodology#legacy">Legacy</Link>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Legacy" }));
    const legacy = await screen.findByRole("heading", { name: /Valdez-Cordova/ });
    expect(legacy).toHaveFocus();
  });
});
