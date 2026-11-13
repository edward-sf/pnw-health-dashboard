import { expect, test, type Page } from "@playwright/test";

// The phone case runs under the `mobile` project (touch, phone user agent); the rest under
// `chromium`. Each test sets its own viewport.
const PHONE = { width: 375, height: 812 };
const SIZES = [{ width: 1440, height: 900 }, { width: 900, height: 800 }, PHONE];

const isPhone = (s: { width: number }) => s.width === PHONE.width;

function onlyIn(project: "chromium" | "mobile", projectName: string) {
  test.skip(projectName !== project, `runs under the ${project} project`);
}

async function open(page: Page, size: { width: number; height: number }, query = "?i=poverty_rate") {
  await page.setViewportSize(size);
  await page.goto(`./${query}`);
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
}

for (const size of SIZES) {
  test(`the map keeps its box when a county opens at ${size.width}×${size.height}`, async ({
    page,
  }, testInfo) => {
    onlyIn(isPhone(size) ? "mobile" : "chromium", testInfo.project.name);
    await open(page, size);
    const svg = page.locator(".county-map svg");
    const before = (await svg.boundingBox())!;
    const king = page.locator('path.county[data-fips="53033"]');
    if (isPhone(size)) await king.tap();
    else await king.click();
    await expect(page.getByRole("dialog", { name: "County details" })).toBeVisible();
    const after = (await svg.boundingBox())!;
    for (const k of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after[k] - before[k]), k).toBeLessThanOrEqual(0.5);
    }
  });
}

test("at 900×800 the open panel is inside the viewport", async ({ page }, testInfo) => {
  onlyIn("chromium", testInfo.project.name);
  await open(page, { width: 900, height: 800 });
  await page.locator('path.county[data-fips="53033"]').click();
  const panel = page.getByRole("dialog", { name: "County details" });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const stage = (await page.locator(".map-stage").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(stage.x);
  expect(box.x + box.width).toBeLessThanOrEqual(Math.min(900, stage.x + stage.width));
  expect(box.y).toBeGreaterThanOrEqual(stage.y);
  expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(panel).toBeInViewport({ ratio: 1 });
  // No page-level horizontal scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
});

test("in table view the open panel sits beside the table, not over it", async ({ page }, testInfo) => {
  onlyIn("chromium", testInfo.project.name);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?i=poverty_rate&view=table&c=53033");
  const panel = page.getByRole("dialog", { name: "County details" });
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("King County");
  const table = (await page.locator(".county-table-wrap").boundingBox())!;
  const box = (await panel.boundingBox())!;
  // A 12px gap between the table frame and the panel.
  expect(box.x - (table.x + table.width)).toBeCloseTo(12, 0);
  expect(box.y).toBeGreaterThanOrEqual(table.y);
  expect(box.y + box.height).toBeLessThanOrEqual(table.y + table.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test("at 1440×900 the map is at least 1000px wide and fully in view; Alaska's frame is at least 181,760 px²", async ({
  page,
}, testInfo) => {
  onlyIn("chromium", testInfo.project.name);
  await open(page, { width: 1440, height: 900 });
  // The drawn map, not the SVG box: the canvas is fitted inside the stage, left-aligned.
  const drawn = await page.locator(".county-map svg").evaluate((svg: SVGSVGElement) => {
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scale = Math.min(box.width / vb.width, box.height / vb.height);
    const height = vb.height * scale;
    const top = box.top + (box.height - height) / 2;
    return { width: vb.width * scale, top, bottom: top + height, left: box.left };
  });
  expect(drawn.width).toBeGreaterThanOrEqual(1000);
  expect(drawn.top).toBeGreaterThanOrEqual(0);
  expect(drawn.left).toBeGreaterThanOrEqual(0);
  expect(drawn.bottom).toBeLessThanOrEqual(900);
  const frame = (await page.locator("rect.inset-frame").boundingBox())!;
  expect(frame.width * frame.height).toBeGreaterThanOrEqual(181_760);
});

test("at 375×812 the map starts within 330px of the top", async ({ page }, testInfo) => {
  onlyIn("mobile", testInfo.project.name);
  await open(page, PHONE);
  const box = (await page.locator(".county-map svg").boundingBox())!;
  expect(box.y).toBeLessThanOrEqual(330);
});

for (const query of ["?i=poverty_rate", "?i=life_expectancy&show=expected"]) {
  test(`every county has a 24px pointer target at 1440×900 on ${query}`, async ({ page }, testInfo) => {
    onlyIn("chromium", testInfo.project.name);
    await open(page, { width: 1440, height: 900 }, query);
    const small = await page.locator(".county-map svg").evaluate((svg: SVGSVGElement) => {
      const scale = svg.getScreenCTM()!.a;
      const out: string[] = [];
      for (const county of svg.querySelectorAll<SVGPathElement>("path.county[data-fips]")) {
        const fips = county.dataset.fips!;
        const b = county.getBBox();
        let [x0, y0, x1, y1] = [b.x, b.y, b.x + b.width, b.y + b.height];
        const halo = svg.querySelector<SVGPathElement>(`path.county-halo[data-fips="${fips}"]`);
        if (halo) {
          // getBBox leaves out the stroke, which is the halo's whole point; add half its width.
          const h = halo.getBBox();
          const pad = Number(halo.getAttribute("stroke-width")) / 2;
          x0 = Math.min(x0, h.x - pad);
          y0 = Math.min(y0, h.y - pad);
          x1 = Math.max(x1, h.x + h.width + pad);
          y1 = Math.max(y1, h.y + h.height + pad);
        }
        const w = (x1 - x0) * scale;
        const hgt = (y1 - y0) * scale;
        if (w < 24 || hgt < 24) out.push(`${fips}: ${w.toFixed(1)}×${hgt.toFixed(1)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
}
