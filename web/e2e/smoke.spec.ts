import { expect, test } from "./fixtures";

test("load, pick an indicator, select a county", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.getByRole("button", { name: /^Measure: / }).click();
  await page.getByRole("option", { name: "Poverty rate", exact: true }).click();
  await expect(page).toHaveURL(/[?&]i=poverty_rate/);
  await page.locator('path.county[data-fips="53033"]').click();
  await expect(page).toHaveURL(/[?&]c=53033/);
  await expect(page.locator('path.county[data-fips="53033"]')).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("dialog", { name: "County details" }).locator("svg circle").first(),
  ).toBeVisible();
});

test("table view and county search", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("radio", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=table/);
  await expect(page.locator(".county-table tbody tr")).toHaveCount(149);
  await page.getByRole("combobox", { name: "Search counties" }).fill("Multnomah");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]c=41051/);
  await expect(
    page.getByRole("dialog", { name: "County details" }).getByRole("heading", { level: 2 }),
  ).toBeFocused();
});

test("strip plot shows every county inside the chart", async ({ page }) => {
  await page.goto("./?i=pct_aian&c=53033");
  const region = page.getByRole("region", { name: "Distribution across counties" });
  await expect(region).toBeVisible();
  const chart = page.locator(".strip-plot-chart");
  await expect(chart).toHaveAttribute("aria-hidden", "true");
  await expect(chart.locator("svg circle")).toHaveCount(150);
  // The marks take the chart tokens, so they follow the theme.
  const { muted, selected, outside } = await chart.locator("svg").evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    const circles = [...svg.querySelectorAll("circle")];
    const fill = (c: Element) => c.getAttribute("fill") ?? c.parentElement?.getAttribute("fill");
    return {
      muted: circles.filter((c) => fill(c) === "var(--chart-muted)").length,
      selected: circles.filter((c) => fill(c) === "var(--chart-ink)").length,
      outside: circles.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom;
      }).length,
    };
  });
  expect(muted).toBe(149);
  expect(selected).toBe(1);
  expect(outside).toBe(0);
});

test("strip plot axis text does not overlap", async ({ page }) => {
  await page.goto("./?i=premature_death&c=53033");
  const svg = page.locator(".strip-plot-chart svg");
  await expect(svg.locator("circle").first()).toBeVisible();
  const overlaps = await svg.evaluate((el) => {
    const boxes = [...el.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
    ).length;
  });
  expect(overlaps).toBe(0);
});

test("model mode: map, card, table and back", async ({ page }) => {
  await page.goto("./?i=life_expectancy");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.getByRole("radio", { name: "Compared with expected", exact: true }).click();
  await expect(page).toHaveURL(/[?&]show=expected/);
  await expect(page).toHaveURL(/[?&]i=life_expectancy/);
  await expect(page.locator(".legend li")).toHaveCount(6);
  await page.locator('path.county[data-fips="53033"]').click();
  await expect(page).toHaveURL(/[?&]c=53033/);
  const panel = page.getByRole("dialog", { name: "County details" });
  await expect(
    panel.getByRole("heading", { name: "Life expectancy model" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", {
      name: "Factors associated with the expected value",
    }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Table", exact: true }).click();
  await expect(page).toHaveURL(/[?&]view=table/);
  await expect(page.getByRole("button", { name: /^Result\b/ })).toBeVisible();
  await expect(page.locator(".county-table tbody tr")).toHaveCount(149);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]c=53033/);
  await expect(page).toHaveURL(/[?&]show=expected/);
  await expect(page.locator(".legend li")).toHaveCount(6);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]show=expected/);
  await expect(panel).toBeHidden();
  await page.goBack();
  await expect(page.locator(".legend")).toContainText("years");
  expect(new URL(page.url()).search).toBe("?i=life_expectancy");
  await expect(page.locator(".legend")).not.toContainText("Not enough data");
});

test("an old model link is rewritten in place", async ({ page }) => {
  await page.goto("./?mode=model&c=53033");
  await expect(page).toHaveURL(/[?&]show=expected/);
  expect(new URL(page.url()).search).toBe("?c=53033&i=life_expectancy&show=expected");
});

test("model mode: change the outcome", async ({ page }) => {
  await page.goto("./?i=life_expectancy&show=expected&c=53033");
  await expect(page.locator("path.county[data-fips]")).toHaveCount(149);
  await page.getByRole("button", { name: "Measure: Life expectancy" }).click();
  await page.getByRole("option", { name: /^Premature death/ }).click();
  await expect(page).toHaveURL(/[?&]i=premature_death/);
  await expect(page).toHaveURL(/[?&]show=expected/);
  await expect(page).toHaveURL(/[?&]c=53033/);
  await expect(
    page.getByText("Premature death (years lost): compared with expected").first(),
  ).toBeVisible();
});

test("select a similar county", async ({ page }) => {
  await page.goto("./?c=53033");
  const panel = page.getByRole("dialog", { name: "County details" });
  const similar = panel.getByRole("region", { name: "Similar counties" });
  const peer = similar.getByRole("button").first();
  const label = (await peer.textContent())?.trim() ?? "";
  expect(label).toMatch(/^.+, [A-Z]{2}$/);
  const name = label.replace(/, [A-Z]{2}$/, "");
  await peer.click();
  await expect(page).toHaveURL(/[?&]c=\d{5}/);
  await expect(page).not.toHaveURL(/[?&]c=53033/);
  const heading = panel.getByRole("heading", { level: 2 });
  await expect(heading).toContainText(name);
  await expect(heading).toBeFocused();
});

test("methodology and about pages render", async ({ page }) => {
  await page.goto("./methodology");
  await expect(page.getByRole("heading", { level: 2, name: "Methodology" })).toBeVisible();
  await expect(page.getByText("At a glance").first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "On this page" }).locator('a[href$="#model"]'),
  ).toBeVisible();
  await page.goto("./about");
  await expect(page.getByRole("heading", { level: 2, name: "About" })).toBeVisible();
});

test("a panel Methodology link lands on and focuses its section", async ({ page }) => {
  // King County (53033) has a model result, so its model card has no Methodology link. Chugach
  // doesn't, so its card links to #no-result (the panel's Similar counties link is a different one).
  await page.goto("./?i=life_expectancy&show=expected&c=02063");
  const panel = page.getByRole("dialog", { name: "County details" });
  await panel.locator(".model-none").getByRole("link", { name: "Methodology", exact: true }).click();
  await expect(page).toHaveURL(/\/methodology#no-result$/);
  const heading = page.getByRole("heading", { level: 4, name: "Counties with no result" });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});

test("race breakdown follows the indicator and the outcome", async ({ page }) => {
  const section = () => page.getByRole("region", { name: "By race and ethnicity (CHR 2025)" });

  await page.goto("./?c=53077&i=life_expectancy");
  await expect(section()).toBeVisible();
  await expect(section().getByText("County overall")).toBeVisible();

  await page.goto("./?c=53077&i=diabetes");
  // Wait for county-specific content so the absence check can't pass before the panel renders.
  await expect(page.getByRole("region", { name: "Who lives here" })).toBeVisible();
  await expect(section()).toHaveCount(0);

  await page.goto("./?i=premature_death&show=expected&c=53077");
  await expect(section()).toHaveCount(1);
  await expect(section()).toBeVisible();
  // The region never names the outcome, so assert it sits directly after the model card.
  const card = page.getByRole("heading", { level: 3, name: "Premature death (years lost) model" });
  await expect(card).toBeVisible();
  await expect(section().getByText("County overall")).toBeVisible();
  const follows = await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3")].find((e) =>
      e.textContent?.includes("Premature death (years lost) model"),
    );
    const r = document.querySelector(".race-breakdown");
    const who = document.querySelector(".who-lives-here");
    const F = Node.DOCUMENT_POSITION_FOLLOWING;
    return !!(h && r && who && h.compareDocumentPosition(r) & F && r.compareDocumentPosition(who) & F);
  });
  expect(follows).toBe(true);
});

test("who lives here shows population and groups", async ({ page }) => {
  await page.goto("./?c=53077");
  const who = page.getByRole("region", { name: "Who lives here" });
  await expect(who).toBeVisible();
  await expect(who.getByText("Total population")).toBeVisible();
  await expect(who.getByRole("heading", { level: 4, name: "Age and sex" })).toBeVisible();
  await expect(who.getByRole("heading", { level: 4, name: "Race and ethnicity" })).toBeVisible();
  await expect(who.getByRole("heading", { level: 4, name: "Other" })).toBeVisible();
});

test("the panel floats over a live map: clicks keep it open, Escape anywhere closes it", async ({
  page,
}) => {
  await page.goto("./?i=poverty_rate");
  await page.locator('path.county[data-fips="53033"]').click();
  const panel = page.getByRole("dialog", { name: "County details" });
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("King County");
  // Opening from the map leaves focus where it was.
  await expect(panel.getByRole("heading", { level: 2 })).not.toBeFocused();
  await page.locator('path.county[data-fips="53077"]').click();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Yakima County");
  // Escape with focus on the toolbar, outside the panel, still closes it.
  await page.getByRole("radio", { name: "Map", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "County details" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]c=/);
});
