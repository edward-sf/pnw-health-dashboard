import { connect } from "node:net";
import { expect, test, type TestInfo } from "@playwright/test";

// Runs on the `pages` project against e2e/pages-server.mjs, which answers unknown paths the way
// GitHub Pages does: status 404 with the body of 404.html. `vite preview` falls back to
// index.html instead, so the other projects never exercise this path.

// The `pages` project's server, from its baseURL in playwright.config.ts.
const origin = (testInfo: TestInfo) => new URL(testInfo.project.use.baseURL ?? "").origin;

// Sends one raw request line and returns the response's status line. Raw, because clients
// refuse to send the malformed targets this needs.
function rawStatusLine(port: number, requestLine: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () =>
      socket.write(`${requestLine}\r\nHost: localhost\r\nConnection: close\r\n\r\n`),
    );
    let data = "";
    socket.on("data", (chunk) => (data += chunk));
    socket.on("close", () => resolve(data.split("\r\n")[0] ?? ""));
    socket.on("error", reject);
  });
}

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

test("paths outside the base and traversal attempts get a 404", async ({ page }, testInfo) => {
  const ORIGIN = origin(testInfo);
  expect((await page.request.get(`${ORIGIN}/elsewhere`)).status()).toBe(404);
  // An encoded slash: URL parsing would normalize a bare `..` or `%2e%2e/` away before the
  // server sees it, but `%2f` survives, so this decodes to `../package.json` on the server.
  const traversal = await page.request.get(`${ORIGIN}/pnw-health-dashboard/%2e%2e%2fpackage.json`);
  expect(traversal.status()).toBe(404);
  expect(await traversal.text()).not.toContain('"name"');
});

test("a malformed request target gets an error response and the server keeps serving", async ({
  page,
}, testInfo) => {
  const port = Number(new URL(origin(testInfo)).port);
  expect(await rawStatusLine(port, "GET http://[::1 HTTP/1.1")).toMatch(/^HTTP\/1\.1 4\d\d /);
  expect((await page.request.get("./")).status()).toBe(200);
});
