import { expect, test, type Locator, type Page } from "@playwright/test";

/** Fails if the focused element has no visible focus outline. */
async function expectFocusOutline(page: Page, step: string) {
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    return el && el !== document.body ? getComputedStyle(el).outlineStyle : "none";
  });
  expect(outline, `no focus outline at: ${step}`).not.toBe("none");
}

/** Presses Tab (or Shift+Tab) until `target` has focus, checking the outline at every stop. */
async function tabTo(page: Page, target: Locator, step: string, backwards = false) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) {
      await expectFocusOutline(page, step);
      return;
    }
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
    await expectFocusOutline(page, `${step} (stop ${i + 1})`);
  }
  throw new Error(`Never reached: ${step}`);
}

test("the explorer can be driven end to end from the keyboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "keyboard walkthrough runs on desktop");
  await page.goto("./?i=poverty_rate");
  await expect(page.locator(".indicator-title")).toHaveText("Poverty rate");

  // Skip link, then the county search.
  await tabTo(page, page.getByRole("link", { name: "Skip to county search" }), "skip link");
  await page.keyboard.press("Enter");
  const search = page.getByRole("combobox", { name: "Search counties" });
  await expect(search).toBeFocused();
  await expectFocusOutline(page, "county search");

  // Measure category: arrow to Outcomes.
  const outcomes = page.getByRole("radio", { name: "Outcomes" });
  await tabTo(page, page.getByRole("radio", { name: "Indicators" }), "Measure category", true);
  await page.keyboard.press("ArrowRight");
  const demographics = page.getByRole("radio", { name: "Demographics" });
  await expect(demographics).toBeChecked();
  await expect(demographics).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(outcomes).toBeChecked();
  await expect(outcomes).toBeFocused();

  // Measure picker: filter and choose.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^Measure: / })).toBeFocused();
  await page.keyboard.press("Enter");
  const filter = page.getByRole("combobox", { name: "Filter measures" });
  await expect(filter).toBeFocused();
  await expectFocusOutline(page, "filter measures");
  await page.keyboard.type("life");
  await page.keyboard.press("Enter");
  await expect(page.locator(".indicator-title")).toHaveText("Life expectancy");
  await expect(page.getByRole("button", { name: "Measure: Life expectancy" })).toBeFocused();

  // Show: Compared with expected.
  const compared = page.getByRole("radio", { name: "Compared with expected" });
  await tabTo(page, page.getByRole("radio", { name: "Observed" }), "Show");
  await page.keyboard.press("ArrowRight");
  await expect(compared).toBeChecked();
  await expect(page).toHaveURL(/[?&]show=expected/);

  // County search: Yakima opens the dialog with focus on its heading.
  await page.keyboard.press("Shift+Tab"); // the County search is earlier in the toolbar
  await tabTo(page, search, "county search again", true);
  await page.keyboard.type("Yakima");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "County details" });
  const heading = dialog.getByRole("heading", { level: 2 });
  await expect(heading).toHaveText("Yakima County");
  await expect(heading).toBeFocused();
  await expectFocusOutline(page, "county heading");

  // A similar-county button moves focus to the new heading.
  const peer = dialog.getByRole("region", { name: "Similar counties" }).getByRole("button").first();
  await tabTo(page, peer, "similar county button");
  const peerName = ((await peer.textContent()) ?? "").replace(/\s*,.*$/, "").trim();
  await page.keyboard.press("Enter");
  await expect(heading).not.toHaveText("Yakima County");
  await expect(heading).toContainText(peerName);
  await expect(heading).toBeFocused();

  // Escape closes the dialog and returns to the county search.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(search).toBeFocused();

  // Theme: Dark.
  await tabTo(page, page.getByRole("button", { name: "Theme" }), "Theme", true);
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Light" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("phone: every toolbar control and the drawer's Close are at least 44×44", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch targets are a phone concern");
  await page.goto("./?i=life_expectancy&c=53077");
  const drawer = page.getByRole("dialog", { name: "County details" });
  await expect(drawer).toBeVisible();
  const controls = [
    ...(await page.locator(".explorer-toolbar").getByRole("radio").all()),
    page.getByRole("button", { name: /^Measure: / }),
    page.getByRole("combobox", { name: "Search counties" }),
    page.getByRole("radiogroup", { name: "Show" }).getByRole("radio").first(),
    page.getByRole("radiogroup", { name: "Show" }).getByRole("radio").last(),
    page.getByRole("button", { name: "About this measure" }),
    page.getByRole("button", { name: "Theme" }),
    drawer.getByRole("button", { name: "Close" }),
  ];
  expect(controls.length).toBeGreaterThan(8);
  for (const control of controls) {
    const box = await control.boundingBox();
    const name = await control.evaluate((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(box, `${name} is on screen`).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
});
