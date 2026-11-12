import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function audit(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await testInfo.attach("axe-results", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(blocking, blocking.join("\n")).toEqual([]);
}

async function explorer(page: Page, query: string) {
  await page.goto(`./${query}`);
  await expect(page.locator(".indicator-title")).toBeVisible();
}

test("explorer: values map", async ({ page }, testInfo) => {
  await explorer(page, "?i=poverty_rate");
  await expect(page.locator("path[data-fips]")).toHaveCount(149);
  await audit(page, testInfo);
});

test("explorer: model map", async ({ page }, testInfo) => {
  await explorer(page, "?i=poverty_rate&mode=model");
  await expect(page.locator(".legend li")).toHaveCount(6);
  await audit(page, testInfo);
});

test("explorer: table view", async ({ page }, testInfo) => {
  await explorer(page, "?i=poverty_rate&view=table");
  await expect(page.locator(".county-table tbody tr")).toHaveCount(149);
  await audit(page, testInfo);
});

test("explorer: county panel open", async ({ page }, testInfo) => {
  await explorer(page, "?i=poverty_rate&c=53033");
  const panel = page.getByRole("complementary", { name: "County details" });
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("King County");
  await expect(panel.locator("svg circle").first()).toBeVisible();
  await audit(page, testInfo);
});

test("explorer: picker disclosure open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the picker is a disclosure on phones only");
  await explorer(page, "?i=poverty_rate");
  const toggle = page.getByRole("button", { name: /^Indicator: / });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Filter indicators")).toBeVisible();
  await audit(page, testInfo);
});

test("methodology page", async ({ page }, testInfo) => {
  await page.goto("./methodology");
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
  await audit(page, testInfo);
});

test("about page", async ({ page }, testInfo) => {
  await page.goto("./about");
  await expect(page.getByRole("heading", { level: 2, name: "About" })).toBeVisible();
  await audit(page, testInfo);
});

test("skip link reaches the county search", async ({ page }) => {
  await explorer(page, "?i=poverty_rate");
  const link = page.getByRole("link", { name: "Skip to county search" });
  // The site header's links come first; the skip link is the Explorer's first tab stop.
  for (let i = 0; i < 10 && !(await link.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Search counties" })).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");
});
