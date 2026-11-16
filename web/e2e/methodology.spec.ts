import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "On this page" });

/** Waits until the page has stopped scrolling (scrollY unchanged for ten frames). */
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = -1;
        let still = 0;
        const tick = () => {
          still = window.scrollY === last ? still + 1 : 0;
          last = window.scrollY;
          if (still >= 10) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

const atBottom = (page: Page) =>
  page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2);

const RAIL_LABELS = [
  "Sources and vintages",
  "Indicators",
  "Geography",
  "Missing and uncertain values",
  "Outcomes by race and ethnicity",
  "How it works",
  "What it leaves out",
  "Similar counties",
  "Reproduce it",
];

test("the reading rail follows the section in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./methodology");
  await expect(page.locator("#model-card")).toBeAttached();
  await page.evaluate(() => document.getElementById("model")!.scrollIntoView());
  await page.mouse.wheel(0, 40);
  await settled(page);
  await expect(rail(page).getByRole("link", { name: "How it works" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

for (const label of RAIL_LABELS) {
  test(`the rail item "${label}" is current after its jump settles`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("./methodology");
    await expect(page.locator("#model-card")).toBeAttached();
    await rail(page).getByRole("link", { name: label }).click();
    await settled(page);
    // A target that cannot reach the top because the page ends first leaves the last item current.
    const expected = (await atBottom(page)) ? "Reproduce it" : label;
    await expect(rail(page).getByRole("link", { name: expected })).toHaveAttribute(
      "aria-current",
      "location",
    );
    await page.mouse.wheel(0, 60);
    await settled(page);
    await expect(rail(page).locator('[aria-current="location"]')).toHaveCount(1);
  });
}

test("the last rail item is current once picked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("./methodology");
  const link = rail(page).getByRole("link", { name: "Reproduce it" });
  await link.click();
  await settled(page);
  await expect(link).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#model-card")).toBeFocused();
});

test("a rail jump scrolls smoothly and lands the heading at the top", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./methodology");
  await expect(page.locator("#model-card")).toBeAttached();
  const samples = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const ys: number[] = [];
        let still = 0;
        const tick = () => {
          const y = window.scrollY;
          still = ys.length && ys[ys.length - 1] === y ? still + 1 : 0;
          ys.push(y);
          if ((still >= 10 && ys[0] !== y) || ys.length > 600) resolve(ys);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await rail(page).getByRole("link", { name: "Geography" }).click();
  const ys = await samples;
  expect(new Set(ys).size).toBeGreaterThan(3);
  const top = await page.evaluate(() => document.getElementById("harmonization")!.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(100);
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

test("a hero strip step jumps to its section and the rail keeps a place", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./methodology");
  await page
    .getByRole("navigation", { name: "Pipeline steps" })
    .getByRole("link", { name: /Model/ })
    .click();
  await expect(page).toHaveURL(/#model-step$/);
  await expect(page.locator("#model-step")).toBeFocused();
  await settled(page);
  await expect(rail(page).locator('[aria-current="location"]')).toHaveCount(1);
});

test("the phone bar names the section and jumps", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./methodology");
  await expect(page.locator("#model-card")).toBeAttached();
  const bar = rail(page).getByRole("button");
  await bar.click();
  await rail(page).getByRole("link", { name: "How it works" }).click();
  await settled(page);
  await expect(page.locator("#model")).toBeFocused();
  await expect(bar).toHaveText("Model · How it works");
  await expect(page.locator("#reading-rail-list")).toBeHidden();
  await bar.click();
  await rail(page).getByRole("link", { name: "Similar counties" }).click();
  await settled(page);
  await expect(page.locator("#similar-counties")).toBeFocused();
  await expect(bar).toHaveText("Model · Similar counties");
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
