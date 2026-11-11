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
