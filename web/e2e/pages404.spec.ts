import { chmod, mkdir, rm } from "node:fs/promises";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import type { TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures";

// Runs on the `pages` project against e2e/pages-server.mjs, which answers unknown paths the way
// GitHub Pages does: status 404 with the body of 404.html. `vite preview` falls back to
// index.html instead, so the other projects never exercise this path.

// The `pages` project's server, from its baseURL in playwright.config.ts.
function origin(testInfo: TestInfo): string {
  const { baseURL } = testInfo.project.use;
  if (!baseURL) {
    throw new Error(`pages404.spec.ts needs a baseURL; project "${testInfo.project.name}" has none`);
  }
  return new URL(baseURL).origin;
}

// Sends one raw request line and returns the whole response. Raw, because clients refuse to
// send the malformed targets this needs.
function rawResponse(port: number, requestLine: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () =>
      socket.write(`${requestLine}\r\nHost: localhost\r\nConnection: close\r\n\r\n`),
    );
    let data = "";
    socket.on("data", (chunk) => (data += chunk));
    socket.on("close", () => resolve(data));
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
  const res = await rawResponse(port, "GET http://[::1 HTTP/1.1");
  expect(res).toMatch(/^HTTP\/1\.1 400 /);
  // The body comes chunked, so look for the text rather than match the whole body.
  expect(res.slice(res.indexOf("\r\n\r\n"))).toContain("Bad request target");
  expect((await page.request.get("./")).status()).toBe(200);
});

test("a bad percent-escape in the path gets a 400, not the 404 page", async ({ page }) => {
  const res = await page.request.get("./%E0%A4%A");
  expect(res.status()).toBe(400);
  expect(await res.text()).toBe("Bad request target");
});

test("origin() names the project when baseURL is missing", () => {
  const testInfo = test.info();
  const noBase = { ...testInfo, project: { ...testInfo.project, name: "x", use: {} } } as TestInfo;
  expect(() => origin(noBase)).toThrow('pages404.spec.ts needs a baseURL; project "x" has none');
});

test("a file the server can't stat gets a 500, not the 404 page", async ({ page }) => {
  // Root ignores file permissions, so the locked directory would stat fine.
  test.skip(process.getuid?.() === 0, "running as root, which ignores file permissions");
  // The pages server serves web/dist; a directory with no permissions makes stat fail with
  // EACCES, which must not be mistaken for a missing file.
  const locked = fileURLToPath(new URL("../dist/locked-for-e2e/", import.meta.url));
  await mkdir(locked, { recursive: true });
  await chmod(locked, 0o000);
  try {
    expect((await page.request.get("./locked-for-e2e/index.html")).status()).toBe(500);
  } finally {
    await chmod(locked, 0o700);
    await rm(locked, { recursive: true, force: true });
  }
});
