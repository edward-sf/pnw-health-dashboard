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
