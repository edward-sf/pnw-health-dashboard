import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const out = resolve(webDir, "../docs/images/explorer.png");
const origin = "http://localhost:4174";
const url = `${origin}/pnw-health-dashboard/?mode=model&c=53033`;

async function isUp() {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

// Resolves once the preview answers. Rejects if the server exits or fails to spawn first, so a
// missing dist/ or a busy port fails with vite's own message rather than a timeout.
function waitForServer(server, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    server.once("error", (err) => settle(reject, err));
    server.once("exit", (code, signal) =>
      settle(reject, new Error(`vite preview exited early (${signal ?? `code ${code}`})`)),
    );
    const deadline = Date.now() + timeoutMs;
    (async () => {
      while (!settled && Date.now() < deadline) {
        if (await isUp()) return settle(resolve);
        await new Promise((r) => setTimeout(r, 250));
      }
      settle(reject, new Error("vite preview did not start in time"));
    })();
  });
}

// vite preview keeps running without a build and answers 404, so check for one up front.
if (!existsSync(resolve(webDir, "dist/index.html"))) {
  throw new Error("dist/index.html is missing; run `npm run screenshot`, which builds first");
}

// Another server on the port would answer the readiness check and end up in the screenshot.
if (await isUp()) {
  throw new Error(`${origin} is already serving; stop that server and rerun`);
}

const server = spawn("npx", ["vite", "preview", "--port", "4174", "--strictPort"], {
  cwd: webDir,
  stdio: ["ignore", "ignore", "inherit"],
});

try {
  await waitForServer(server);
  await mkdir(dirname(out), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url);
    await page.getByRole("heading", { name: "Life expectancy model" }).waitFor();
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
  console.log(`Wrote ${out}`);
} finally {
  server.kill();
}
