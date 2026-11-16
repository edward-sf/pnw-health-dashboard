import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "On this page" });

/**
 * Scrolls a heading past the scrollspy's reading line in small steps. The spy watches a
 * zero-height line, so one long jump can skip it and report nothing; a reader's wheel never does.
 */
async function readDownTo(page: Page, id: string) {
  const top = () => page.evaluate((i) => document.getElementById(i)!.getBoundingClientRect().top, id);
  await page.evaluate((i) => {
    const el = document.getElementById(i)!;
    window.scrollBy(0, el.getBoundingClientRect().top - 400);
  }, id);
  for (let n = 0; n < 40 && (await top()) > 200; n++) await page.mouse.wheel(0, 20);
}

test("the reading rail follows the section in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./methodology");
  // The page lays out once its data loads; scroll only after the rail and the last section exist.
  const link = rail(page).getByRole("link", { name: "How it works" });
  await expect(page.locator("#model-card")).toBeAttached();
  await expect(link).toBeVisible();
  await readDownTo(page, "model");
  await expect(link).toHaveAttribute("aria-current", "location");
});

test("the last rail item is current once picked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("./methodology");
  const link = rail(page).getByRole("link", { name: "Reproduce it" });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", /.+/);
  await expect(page.locator("#model-card")).toBeFocused();
});

for (const id of [
  "legacy",
  "suppression",
  "unreliable",
  "no-result",
  "model-importance",
  "similar-counties",
]) {
  test(`deep link #${id} is visible and focused`, async ({ page }) => {
    await page.goto(`./methodology#${id}`);
    const target = page.locator(`#${id}`);
    await expect(target).toBeVisible();
    await expect(target).toBeFocused();
  });
}

test("a hero strip step jumps to its section", async ({ page }) => {
  await page.goto("./methodology");
  await page
    .getByRole("navigation", { name: "Pipeline steps" })
    .getByRole("link", { name: /Model/ })
    .click();
  await expect(page).toHaveURL(/#model-step$/);
  await expect(page.locator("#model-step")).toBeFocused();
});

test("the phone bar names the section and jumps", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./methodology");
  await expect(page.locator("#model-card")).toBeAttached();
  await readDownTo(page, "sources");
  const bar = rail(page).getByRole("button");
  await expect(bar).toHaveText("Fetch · Sources and vintages");
  await bar.click();
  await rail(page).getByRole("link", { name: "Similar counties" }).click();
  await expect(page.locator("#similar-counties")).toBeFocused();
  await expect(page.locator("#reading-rail-list")).toBeHidden();
});

for (const width of [375, 721, 900, 1100, 1440]) {
  test(`the Model section lays out at ${width}px: no sideways scroll, R² bars drawn`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./methodology");
    await expect(page.locator("#model-card")).toBeAttached();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const widths = await page.locator(".r2-bar").evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().width),
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeGreaterThan(0);
  });
}
