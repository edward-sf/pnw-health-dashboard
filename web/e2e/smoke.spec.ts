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
