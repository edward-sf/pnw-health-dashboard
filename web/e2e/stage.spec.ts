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

/** The drawn map's box in page coordinates: the canvas is fitted inside the SVG, left-aligned. */
async function drawnMap(page: Page) {
  return page.locator(".county-map svg").evaluate((svg: SVGSVGElement) => {
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scale = Math.min(box.width / vb.width, box.height / vb.height);
    const height = vb.height * scale;
    const top = box.top + (box.height - height) / 2 + window.scrollY;
    const r = (n: number) => Math.round(n * 2) / 2;
    return `${r(box.left)},${r(top)} ${r(vb.width * scale)}×${r(height)}`;
  });
}

// Shortest and longest label (copd, pct_nhpi), shortest and longest description
// (total_population, pct_nhpi), Demographics (pct_female, pct_nhpi), a modelled outcome in both
// Show states, and the longest Compared-with-expected heading (premature_death).
const MEASURES = [
  "?i=poverty_rate",
  "?i=copd",
  "?i=total_population",
  "?i=pct_female",
  "?i=pct_nhpi",
  "?i=life_expectancy",
  "?i=life_expectancy&show=expected",
  "?i=premature_death&show=expected",
];

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

for (const size of SIZES) {
  test(`the map keeps one box across measures, the Show switch and a county at ${size.width}×${size.height}`, async ({
    page,
  }, testInfo) => {
    onlyIn(isPhone(size) ? "mobile" : "chromium", testInfo.project.name);
    const boxes = new Map<string, string[]>();
    const record = async (state: string) => {
      const box = await drawnMap(page);
      boxes.set(box, [...(boxes.get(box) ?? []), state]);
    };
    for (const query of MEASURES) {
      await open(page, size, query);
      await record(query);
    }
    // Flip the switch in place, then open a county.
    await open(page, size, "?i=injury_deaths");
    await record("injury_deaths");
    const compared = page.getByRole("radio", { name: "Compared with expected" });
    if (isPhone(size)) await compared.tap();
    else await compared.click();
    await expect(page).toHaveURL(/[?&]show=expected/);
    await record("injury_deaths, switched to Compared with expected");
    const king = page.locator('path.county[data-fips="53033"]');
    if (isPhone(size)) await king.tap();
    else await king.click();
    await expect(page.getByRole("dialog", { name: "County details" })).toBeVisible();
    await record("injury_deaths, Compared with expected, King County open");
    expect(boxes.size, JSON.stringify(Object.fromEntries(boxes), null, 1)).toBe(1);
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

for (const query of ["?i=poverty_rate", "?i=pct_nhpi", "?i=life_expectancy", "?i=life_expectancy&show=expected"]) {
  test(`at 375×812 the map starts within 330px of the top on ${query}`, async ({ page }, testInfo) => {
    onlyIn("mobile", testInfo.project.name);
    await open(page, PHONE, query);
    const box = (await page.locator(".county-map svg").boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(330);
  });
}

test("at 1440×900 map view fits the viewport with no page scroll", async ({ page }, testInfo) => {
  onlyIn("chromium", testInfo.project.name);
  for (const query of MEASURES) {
    await open(page, { width: 1440, height: 900 }, query);
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight, query).toBeLessThanOrEqual(innerHeight);
  }
});

for (const query of ["?i=poverty_rate", "?i=life_expectancy&show=expected"]) {
  test(`every county has a 24px pointer target at 1440×900 on ${query}`, async ({ page }, testInfo) => {
    onlyIn("chromium", testInfo.project.name);
    await open(page, { width: 1440, height: 900 }, query);
    // Ask the browser what the pointer hits on a half-pixel grid over the map, and take each
    // county's reachable box as the extent of the points that land on it (or on its halo).
    const reach = await page.locator(".county-map svg").evaluate((svg: SVGSVGElement) => {
      const box = svg.getBoundingClientRect();
      const boxes: Record<string, [number, number, number, number]> = {};
      for (let y = box.top; y < box.bottom; y += 0.5) {
        for (let x = box.left; x < box.right; x += 0.5) {
          const fips = (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset?.fips;
          if (!fips) continue;
          const b = boxes[fips];
          if (!b) boxes[fips] = [x, y, x, y];
          else {
            b[0] = Math.min(b[0], x);
            b[1] = Math.min(b[1], y);
            b[2] = Math.max(b[2], x);
            b[3] = Math.max(b[3], y);
          }
        }
      }
      return Object.entries(boxes).map(([f, [x0, y0, x1, y1]]) => ({
        fips: f,
        w: x1 - x0 + 0.5,
        h: y1 - y0 + 0.5,
      }));
    });
    expect(reach).toHaveLength(149);
    const short = reach.filter(({ w, h }) => w < 24 || h < 24).map(({ fips, w, h }) => `${fips}: ${w}×${h}`);
    expect(short).toEqual([]);
  });
}
