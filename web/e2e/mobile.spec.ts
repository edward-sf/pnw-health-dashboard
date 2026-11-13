import { expect, test, type Page } from "@playwright/test";

/** The share of the viewport the drawer covers, from its top edge to the bottom of the screen. */
async function drawerShare(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".county-panel[data-vaul-drawer]");
    if (!el) return 0;
    return (window.innerHeight - el.getBoundingClientRect().top) / window.innerHeight;
  });
}

/** Drags the drawer's handle vertically by `dy` CSS px with the mouse (vaul reads pointer events). */
async function dragHandle(page: Page, dy: number) {
  const handle = (await page.locator(".county-panel [data-vaul-handle]").boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
}

test("tap a county: the drawer opens at 40%, the handle drags it to 85% and back, Close closes", async ({
  page,
}) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.locator('path.county[data-fips="53033"]').tap();
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { level: 2 })).toHaveText("King County");
  await expect(page.locator("[role=tooltip]")).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Expand" })).toHaveCount(0);
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);

  const height = page.viewportSize()!.height;
  await dragHandle(page, -height * 0.45);
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.85, 1);
  // vaul ignores drags for 500ms after reaching the top snap point, so content can scroll first.
  await page.waitForTimeout(600);
  await dragHandle(page, height * 0.45);
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);

  await drawer.getByRole("button", { name: "Close" }).tap();
  await expect(page.getByRole("dialog", { name: "County details" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]c=/);
});

test("a new county reopens the drawer in peek", async ({ page }) => {
  await page.goto("./?i=poverty_rate&c=53033");
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);
  await drawer.locator("[data-vaul-handle]").click();
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.85, 1);
  const peer = drawer.getByRole("region", { name: "Similar counties" }).getByRole("button").first();
  await peer.scrollIntoViewIfNeeded();
  await peer.tap();
  await expect(page).not.toHaveURL(/[?&]c=53033/);
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);
});

test("dragging the drawer below its lower snap point closes it", async ({ page }) => {
  await page.goto("./?i=poverty_rate&c=53033");
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);
  await dragHandle(page, page.viewportSize()!.height * 0.35);
  await expect(page.getByRole("dialog", { name: "County details" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]c=/);
});

test("with the drawer open the page behind still scrolls and takes taps", async ({ page }) => {
  await page.goto("./?i=poverty_rate");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.locator('path.county[data-fips="53033"]').tap();
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.4, 1);

  // A county above the drawer still takes a tap, and its details replace the open county's.
  await page.locator('path.county[data-fips="53073"]').tap();
  await expect(page).toHaveURL(/[?&]c=53073/);
  await expect(drawer.getByRole("heading", { level: 2 })).toHaveText("Whatcom County");

  // The page still scrolls, and its controls stay in the accessibility tree.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(180, 150);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "Measure: Poverty rate" })).toBeVisible();
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

test("the drawer header stays in view while its content scrolls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?i=life_expectancy&show=expected&c=53033");
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect(drawer.locator("svg").first()).toBeVisible();
  const body = drawer.locator(".panel-body");
  for (const share of [0.4, 0.85]) {
    // Tapping the handle in peek opens the drawer to the upper snap point.
    if (share === 0.85) await drawer.locator("[data-vaul-handle]").click();
    await expect.poll(() => drawerShare(page)).toBeCloseTo(share, 1);
    const scrolled = await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await expect(drawer.getByRole("heading", { level: 2 })).toBeInViewport();
    await expect(drawer.getByRole("button", { name: "Close" })).toBeInViewport();
    // The end of the content can be scrolled onto the screen at either snap point.
    await expect(body.locator(":scope > *").last()).toBeInViewport();
  }
});

test("Close and the Outcome select are 44px touch targets", async ({ page }) => {
  await page.goto("./?i=poverty_rate&c=53033");
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect(drawer).toBeVisible();
  const close = (await drawer.getByRole("button", { name: "Close" }).boundingBox())!;
  // The drawer sits at a fractional offset, so boxes are rounded before comparing.
  expect(Math.round(close.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(close.height)).toBeGreaterThanOrEqual(44);
  await drawer.locator("[data-vaul-handle]").click();
  await expect.poll(() => drawerShare(page)).toBeCloseTo(0.85, 1);
  const select = drawer.getByRole("combobox", { name: "Outcome" });
  await select.scrollIntoViewIfNeeded();
  expect(Math.round((await select.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await select.tap();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const heights = await options.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  );
  expect(heights).toHaveLength(3);
  expect(heights.filter((h) => Math.round(h) < 44)).toEqual([]);
  await page.getByRole("option", { name: "Injury deaths" }).tap();
  await expect(page).toHaveURL(/[?&]t=injury_deaths/);
  await expect(drawer.getByRole("heading", { level: 3, name: /^Injury deaths/ })).toBeVisible();
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
