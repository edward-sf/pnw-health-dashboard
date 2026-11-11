import { expect, test } from "@playwright/test";

test("tap a county, expand, collapse and close the sheet", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator("path[data-fips]")).toHaveCount(149);
  await page.locator('path[data-fips="53033"]').tap();
  const sheet = page.locator(".county-panel--sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText("King County");
  await expect(page.locator("[role=tooltip]")).toHaveCount(0);

  await sheet.getByRole("button", { name: "Expand" }).tap();
  const collapse = sheet.getByRole("button", { name: "Collapse" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.tap();
  await expect(sheet.getByRole("button", { name: "Expand" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await sheet.getByRole("button", { name: "Close" }).tap();
  await expect(page.getByRole("complementary", { name: "County details" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]c=/);
});

test("the indicator picker opens, chooses and closes", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  const toggle = page.getByRole("button", { name: /^Indicator: / });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.tap();
  await page.getByRole("button", { name: "Median household income" }).tap();
  await expect(page).toHaveURL(/[?&]i=median_household_income/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Filter indicators")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Median household income" })).toHaveCount(0);
});

test("the sheet header stays in view while the sheet scrolls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?i=poverty_rate&c=53033&mode=model");
  const sheet = page.locator(".county-panel--sheet");
  await sheet.getByRole("button", { name: "Expand" }).tap();
  await expect(sheet).toHaveClass(/county-panel--expanded/);
  await expect(sheet.locator("svg").first()).toBeVisible();
  const scrolled = await sheet.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  const sheetBox = await sheet.boundingBox();
  for (const name of ["Collapse", "Close"]) {
    const box = await sheet.getByRole("button", { name }).boundingBox();
    expect(box!.y, name).toBeGreaterThanOrEqual(sheetBox!.y);
  }
  await expect(sheet.getByRole("heading", { level: 2 })).toBeInViewport();
});
