import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { manifest, topology, values } from "./test/fixtures";

const bodies: Record<string, unknown> = {
  "manifest.json": manifest,
  "values.json": values,
  "counties.topojson": topology,
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

  it("/methodology renders the stub", () => {
    at("/methodology");
    expect(
      screen.getByRole("heading", { level: 2, name: "Methodology" }),
    ).toBeInTheDocument();
  });

  it("/about renders the stub", () => {
    at("/about");
    expect(
      screen.getByRole("heading", { level: 2, name: "About" }),
    ).toBeInTheDocument();
  });

  it("an unknown path redirects to the explorer", async () => {
    at("/nope");
    expect(await screen.findByRole("group", { name: "County map" })).toBeInTheDocument();
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
