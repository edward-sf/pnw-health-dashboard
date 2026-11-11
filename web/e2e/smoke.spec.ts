import { expect, test } from "@playwright/test";

test("load, pick an indicator, select a county", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("path[data-fips]")).toHaveCount(149);
  await page.getByRole("button", { name: "Poverty rate" }).click();
  await expect(page).toHaveURL(/[?&]i=poverty_rate/);
  await page.locator('path[data-fips="53033"]').click();
  await expect(page).toHaveURL(/[?&]c=53033/);
  await expect(page.locator('path[data-fips="53033"]')).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("complementary", { name: "County details" }).locator("svg circle").first(),
  ).toBeVisible();
});

test("table view and county search", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=table/);
  await expect(page.locator("tbody tr")).toHaveCount(149);
  await page.getByRole("combobox", { name: "Search counties" }).fill("Multnomah");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]c=41051/);
  await expect(
    page.getByRole("complementary", { name: "County details" }).getByRole("heading", { level: 2 }),
  ).toBeFocused();
});

test("strip plot shows every county inside the chart", async ({ page }) => {
  await page.goto("./?i=pct_aian&c=53033");
  const region = page.getByRole("region", { name: "Distribution across counties" });
  await expect(region).toBeVisible();
  const chart = page.locator(".strip-plot-chart");
  await expect(chart).toHaveAttribute("aria-hidden", "true");
  await expect(chart.locator("svg circle")).toHaveCount(150);
  const { grey, selected, outside } = await chart.locator("svg").evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    const circles = [...svg.querySelectorAll("circle")];
    const fill = (c: Element) => c.getAttribute("fill") ?? c.parentElement?.getAttribute("fill");
    return {
      grey: circles.filter((c) => fill(c) === "#9ca3af").length,
      selected: circles.filter((c) => fill(c) === "#000").length,
      outside: circles.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom;
      }).length,
    };
  });
  expect(grey).toBe(149);
  expect(selected).toBe(1);
  expect(outside).toBe(0);
});

test("strip plot axis text does not overlap", async ({ page }) => {
  await page.goto("./?i=premature_death&c=53033");
  const svg = page.locator(".strip-plot-chart svg");
  await expect(svg.locator("circle").first()).toBeVisible();
  const overlaps = await svg.evaluate((el) => {
    const boxes = [...el.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
    ).length;
  });
  expect(overlaps).toBe(0);
});

test("model mode: map, card, table and back", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator("path[data-fips]")).toHaveCount(149);
  await page.getByRole("button", { name: "Model", exact: true }).click();
  await expect(page).toHaveURL(/[?&]mode=model/);
  await expect(page).toHaveURL(/[?&]i=poverty_rate/);
  await expect(page.locator(".legend li")).toHaveCount(6);
  await page.locator('path[data-fips="53033"]').click();
  await expect(page).toHaveURL(/[?&]c=53033/);
  const panel = page.getByRole("complementary", { name: "County details" });
  await expect(
    panel.getByRole("heading", { name: "Life expectancy model" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", {
      name: "Factors associated with the expected value",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=table/);
  await expect(page.getByRole("button", { name: "Result" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(149);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]view=table/);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]c=53033/);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]mode=/);
  await expect(page).toHaveURL(/[?&]i=poverty_rate/);
  await expect(page.locator(".legend")).toContainText("%");
  await expect(page.locator(".legend")).not.toContainText("Not enough data");
});
