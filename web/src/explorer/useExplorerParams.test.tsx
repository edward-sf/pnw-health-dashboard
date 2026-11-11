import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { manifest } from "../test/fixtures";
import { useExplorerParams } from "./useExplorerParams";

const fipsSet = new Set(["53033", "02016"]);

type Api = ReturnType<typeof useExplorerParams>;
let api: Api;

function Probe() {
  const result = useExplorerParams(manifest, fipsSet);
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
