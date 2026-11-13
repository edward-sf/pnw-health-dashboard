import { expect, test } from "@playwright/test";

test("tap a county, expand, collapse and close the sheet", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.locator('path.county[data-fips="53033"]').tap();
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

test("the measure list opens, chooses and closes", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  const toggle = page.getByRole("button", { name: "Measure: Poverty rate" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.tap();
  await page.getByRole("option", { name: "Median household income", exact: true }).tap();
  await expect(page).toHaveURL(/[?&]i=median_household_income/);
  const changed = page.getByRole("button", { name: "Measure: Median household income" });
  await expect(changed).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("combobox", { name: "Filter measures" })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("the category switch selects that category's first measure", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await page.getByRole("radio", { name: "Outcomes" }).tap();
  await expect(page).not.toHaveURL(/[?&]i=poverty_rate/);
  await expect(page.getByRole("radio", { name: "Outcomes" })).toHaveAttribute("aria-checked", "true");
});

test("About this measure shows the description", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator(".indicator-description")).toHaveCount(0);
  await page.getByRole("button", { name: "About this measure" }).tap();
  await expect(page.locator(".indicator-description")).toBeVisible();
});

test("the sheet header stays in view while the sheet scrolls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?i=life_expectancy&show=expected&c=53033");
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

test("the measure list's options and filter input are 44px touch targets", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await page.getByRole("button", { name: "Measure: Poverty rate" }).tap();
  const input = page.getByRole("combobox", { name: "Filter measures" });
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const heights = await options.evaluateAll((els) =>
    els.map((el) => [el.textContent, el.getBoundingClientRect().height] as const),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.filter(([, h]) => h < 44)).toEqual([]);
});
