import { act, render, screen } from "@testing-library/react";
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
  await userEvent.click(screen.getByRole("button", { name: "Ada" }));
  expect(screen.getByRole("heading", { name: "Ada" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Ada" })).toHaveFocus();
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
