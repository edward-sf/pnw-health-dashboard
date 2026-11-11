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
