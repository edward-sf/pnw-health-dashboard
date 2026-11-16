import { expect, test } from "./fixtures";

// The panel's content must fit its width in both modes, from a 320px phone to a desktop. The
// per-100k outcome (premature death) has the longest figures, so it is the hardest case.
for (const vp of [
  { width: 320, height: 640 },
  { width: 1280, height: 800 },
]) {
  for (const url of [
    "./?i=life_expectancy&c=53033",
    "./?i=premature_death&show=expected&c=53033",
  ]) {
    test(`the county panel has no horizontal overflow at ${vp.width}px: ${url}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(url);
      const body = page.locator(".panel-body");
      await expect(body.getByRole("heading", { name: "Associated factors" })).toBeAttached();
      await expect(body.locator(".similar-table tbody tr").first()).toBeAttached();
      const over = await body.evaluate((el) => {
        const right = el.getBoundingClientRect().right;
        return [...el.querySelectorAll("*")]
          .filter((c) => c.getBoundingClientRect().right > right + 0.5)
          .map((c) => `${c.tagName.toLowerCase()}.${c.getAttribute("class") ?? ""}`)
          .slice(0, 5);
      });
      expect(over).toEqual([]);
      expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
}

// Each model figure's text must stay inside its own column, so neighbours never run together.
// Kusilvak and Yukon-Koyukuk carry the longest per-100k figures.
for (const fips of ["53033", "02158", "02290"]) {
  for (const width of [320, 375]) {
    test(`model figures stay inside their columns at ${width}px for ${fips}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`./?i=premature_death&show=expected&c=${fips}`);
      const figures = page.locator(".model-figures");
      await expect(figures.locator("dd")).toHaveCount(3);
      const spills = await figures.evaluate((dl) =>
        [...dl.querySelectorAll(":scope > div")].flatMap((col) => {
          const box = col.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(col.querySelector("dd")!);
          return [...range.getClientRects()]
            .filter((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5)
            .map(() => col.querySelector("dd")!.textContent);
        }),
      );
      expect(spills).toEqual([]);
    });
  }
}
