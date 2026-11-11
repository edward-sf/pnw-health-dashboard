import { render, screen } from "@testing-library/react";
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
    expect(await screen.findByText(/3 indicators loaded/)).toBeInTheDocument();
  });
});
