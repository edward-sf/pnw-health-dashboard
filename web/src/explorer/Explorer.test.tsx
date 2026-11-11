import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { manifest, topology, values } from "../test/fixtures";
import { Explorer } from "./Explorer";

function setup(url = "/") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Explorer data={{ manifest, values, topology }} />
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
  expect(screen.queryByText(/of \d+ counties/)).not.toBeInTheDocument();
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
