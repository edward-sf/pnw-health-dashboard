import { expect, test } from "./fixtures";

const IMAGE = /^https:\/\/.+\/pnw-health-dashboard\/og-image\.png$/;

test("social tags are absolute and include the Pages base path", async ({ page }) => {
  await page.goto("./");
  const meta = (attr: string, key: string) =>
    page.locator(`meta[${attr}="${key}"]`).getAttribute("content");
  expect(await meta("property", "og:title")).toBe("PNW Health Atlas");
  expect(await meta("property", "og:description")).toBe(
    "County health across Washington, Oregon, Idaho and Alaska.",
  );
  expect(await meta("property", "og:image")).toMatch(IMAGE);
  expect(await meta("name", "twitter:image")).toMatch(IMAGE);
  expect(await meta("property", "og:url")).toMatch(/\/pnw-health-dashboard\/$/);
});

test("the icons exist and both theme-color metas are present", async ({ page, request }) => {
  await page.goto("./");
  for (const selector of [
    'link[rel="icon"][type="image/svg+xml"]',
    'link[rel="icon"][sizes="32x32"]',
    'link[rel="apple-touch-icon"]',
    "meta[property='og:image']",
  ]) {
    const el = page.locator(selector);
    const url = new URL(
      (await el.getAttribute("href")) ?? (await el.getAttribute("content")) ?? "",
      page.url(),
    );
    // og:image is absolute on the public origin; fetch the same path from the preview server.
    const res = await request.get(new URL(url.pathname, page.url()).href);
    expect(res.status(), selector).toBe(200);
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
});

test("the header fits at 320px wide", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./");
  const header = page.getByRole("banner");
  await expect(header.getByRole("heading", { level: 1, name: "PNW Health Atlas" })).toBeVisible();
  for (const name of ["Explorer", "Methodology", "About"]) {
    await expect(header.getByRole("link", { name })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const overlap = await page.evaluate(() => {
    const inner = document.querySelector(".site-header-inner");
    const boxes = [...(inner?.children ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    const hits: string[] = [];
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => {
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 0.5 && y > 0.5) hits.push(`${a.name}/${b.name}`);
      }),
    );
    return hits;
  });
  expect(overlap).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`header links take the --focus-on-fir ring in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("pnw-theme", t), theme);
    await page.goto("./");
    const link = page.getByRole("banner").getByRole("link", { name: "Explorer" });
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
    const { outline, token } = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--focus-on-fir)";
      document.body.append(probe);
      const token = getComputedStyle(probe).color;
      probe.remove();
      return {
        outline: getComputedStyle(document.activeElement as Element).outlineColor,
        token,
      };
    });
    expect(outline).toBe(token);
  });
}
