import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "react-router";
import App from "./App";
import { manifest, model, topology, values } from "./test/fixtures";

function LocationProbe({ onChange }: { onChange: (search: string) => void }) {
  onChange(useLocation().search);
  return null;
}

const bodies: Record<string, unknown> = {
  "manifest.json": manifest,
  "values.json": values,
  "counties.topojson": topology,
  "model.json": model,
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
afterEach(() => vi.unstubAllGlobals());

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
    await user.click(screen.getByRole("link", { name: "Methodology" }));
    expect(search).toBe("");
    await user.click(screen.getByRole("link", { name: "Explorer" }));
    expect(search).toBe("?i=poverty_rate&c=53033&mode=model&view=table");
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
});
