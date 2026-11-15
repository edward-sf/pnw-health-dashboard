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
  // The nav box is narrower than its links at this width, so compare the links and the button.
  const itemHits = await page.evaluate(() => {
    const items = [
      ...document.querySelectorAll(".site-header nav a, .site-header .theme-menu"),
    ].map((el) => ({ name: el.textContent?.trim() ?? "", r: el.getBoundingClientRect() }));
    const hits: string[] = [];
    items.forEach((a, i) =>
      items.slice(i + 1).forEach((b) => {
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 0.5 && y > 0.5) hits.push(`${a.name}/${b.name}`);
      }),
    );
    return hits;
  });
  expect(itemHits).toEqual([]);
  // Two rows: the theme button sits in the nav links' row, and the header keeps its height.
  const rows = await page.evaluate(() => {
    const top = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return {
      link: top(".site-header nav a"),
      button: top(".site-header .theme-menu"),
      header: document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(rows.link).toBeGreaterThanOrEqual(0);
  expect(Math.abs(rows.button - rows.link)).toBeLessThanOrEqual(1);
  expect(rows.header).toBeLessThanOrEqual(80);
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

for (const vp of [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
]) {
  test(`the header focus rings stay inside the header and viewport at ${vp.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto("./");
    const banner = page.getByRole("banner");
    for (const [role, name] of [
      ["link", "Explorer"],
      ["link", "Methodology"],
      ["link", "About"],
      ["button", "Theme"],
    ] as const) {
      const control = banner.getByRole(role, { name });
      await control.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(control).toBeFocused();
      const m = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const w = parseFloat(cs.outlineWidth);
        const o = parseFloat(cs.outlineOffset);
        const head = document.querySelector(".site-header")!.getBoundingClientRect();
        return {
          top: r.top - o - w,
          bottom: r.bottom + o + w,
          left: r.left - o - w,
          right: r.right + o + w,
          head: { top: head.top, bottom: head.bottom },
        };
      });
      expect(m.top, name).toBeGreaterThanOrEqual(Math.max(0, m.head.top) - 0.01);
      expect(m.bottom, name).toBeLessThanOrEqual(m.head.bottom + 0.01);
      expect(m.left, name).toBeGreaterThanOrEqual(-0.01);
      expect(m.right, name).toBeLessThanOrEqual(vp.width + 0.01);
    }
  });
}
