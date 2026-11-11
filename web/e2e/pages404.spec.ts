import { expect, test } from "@playwright/test";

// Runs on the `pages` project against e2e/pages-server.mjs, which answers unknown paths the way
// GitHub Pages does: status 404 with the body of 404.html. `vite preview` falls back to
// index.html instead, so the other projects never exercise this path.

const ORIGIN = "http://localhost:4175";

test("a deep link through the real 404 restores path, query and hash", async ({ page }) => {
  const res = await page.request.get("./methodology?i=poverty_rate");
  expect(res.status()).toBe(404);

  await page.goto("./methodology?i=poverty_rate#sources");
  await expect(page.getByRole("heading", { level: 2, name: "Methodology" })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe("/pnw-health-dashboard/methodology");
  expect(url.search).toBe("?i=poverty_rate");
  expect(url.hash).toBe("#sources");
});

test("paths outside the base and traversal attempts get a 404", async ({ page }) => {
  expect((await page.request.get(`${ORIGIN}/elsewhere`)).status()).toBe(404);
  // An encoded slash: URL parsing would normalize a bare `..` or `%2e%2e/` away before the
  // server sees it, but `%2f` survives, so this decodes to `../package.json` on the server.
  const traversal = await page.request.get(`${ORIGIN}/pnw-health-dashboard/%2e%2e%2fpackage.json`);
  expect(traversal.status()).toBe(404);
  expect(await traversal.text()).not.toContain('"name"');
});
