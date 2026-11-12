import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { manifest } from "../test/fixtures";
import { useExplorerParams } from "./useExplorerParams";

const fipsSet = new Set(["53033", "02016"]);
let targetIds = ["life_expectancy", "premature_death", "injury_deaths"];

type Api = ReturnType<typeof useExplorerParams>;
let api: Api;

function Probe() {
  const result = useExplorerParams(manifest, fipsSet, targetIds);
  useEffect(() => {
    api = result;
  });
  return null;
}

function setup(url: string) {
  const router = createMemoryRouter([{ path: "/", element: <Probe /> }], {
    initialEntries: ["/start", url],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

test("removes only invalid params", async () => {
  const router = setup("/?i=bogus&c=53033");
  expect(router.state.location.search).toBe("?c=53033");
});

test("cleanup replaces history instead of pushing", async () => {
  const router = setup("/?i=bogus&c=53033");
  expect(router.state.location.search).toBe("?c=53033");
  expect(router.state.historyAction).toBe("REPLACE");
  await act(async () => router.navigate(-1));
  expect(router.state.location.pathname).toBe("/start");
});

test("setIndicator keeps c and pushes", async () => {
  const router = setup("/?c=53033");
  await act(async () => api.setIndicator("median_household_income"));
  expect(router.state.location.search).toBe("?c=53033&i=median_household_income");
  expect(router.state.historyAction).toBe("PUSH");
});

test("setCounty keeps i and pushes", async () => {
  const router = setup("/?i=pct_asian");
  await act(async () => api.setCounty("02016"));
  expect(router.state.location.search).toBe("?i=pct_asian&c=02016");
  expect(router.state.historyAction).toBe("PUSH");
});

test("setCounty with the current county does not push", async () => {
  const router = setup("/?c=53033");
  const key = router.state.location.key;
  await act(async () => api.setCounty("53033"));
  expect(router.state.location.key).toBe(key);
  expect(router.state.historyAction).toBe("POP");
});

test("setIndicator with the current indicator does not push", async () => {
  const router = setup("/?i=median_household_income");
  const key = router.state.location.key;
  await act(async () => api.setIndicator("median_household_income"));
  expect(router.state.location.key).toBe(key);
  expect(router.state.historyAction).toBe("POP");
});

test("setCounty(null) deletes only c", async () => {
  const router = setup("/?i=pct_asian&c=53033");
  await act(async () => api.setCounty(null));
  expect(router.state.location.search).toBe("?i=pct_asian");
});

test("setMode pushes, keeps i, c and view, and values deletes mode", async () => {
  const router = setup("/?i=poverty_rate&c=53033&view=table");
  await act(async () => api.setMode("model"));
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033&view=table&mode=model");
  expect(router.state.historyAction).toBe("PUSH");
  await act(async () => api.setMode("values"));
  expect(router.state.location.search).toBe("?i=poverty_rate&c=53033&view=table");
});

test("setTarget keeps c and i and pushes", async () => {
  const router = setup("/?i=pct_asian&c=53033&mode=model");
  await act(async () => api.setTarget("injury_deaths"));
  expect(router.state.location.search).toBe("?i=pct_asian&c=53033&mode=model&t=injury_deaths");
  expect(router.state.historyAction).toBe("PUSH");
});

test("t survives a switch to values mode and back", async () => {
  const router = setup("/?mode=model&t=premature_death");
  await act(async () => api.setMode("values"));
  expect(router.state.location.search).toBe("?t=premature_death");
  expect(api.params.target).toBe("premature_death");
  await act(async () => api.setMode("model"));
  expect(router.state.location.search).toBe("?t=premature_death&mode=model");
});

test("setTarget to the default removes t", async () => {
  const router = setup("/?t=injury_deaths&c=53033");
  await act(async () => api.setTarget("life_expectancy"));
  expect(router.state.location.search).toBe("?c=53033");
});

test("removes an invalid t", async () => {
  const router = setup("/?t=nope&c=53033");
  expect(router.state.location.search).toBe("?c=53033");
});

test("setTarget to the default removes t when the keys are ordered differently", async () => {
  targetIds = ["premature_death", "life_expectancy", "injury_deaths"];
  try {
    const router = setup("/?t=injury_deaths&c=53033");
    await act(async () => api.setTarget("life_expectancy"));
    expect(router.state.location.search).toBe("?c=53033");
  } finally {
    targetIds = ["life_expectancy", "premature_death", "injury_deaths"];
  }
});
