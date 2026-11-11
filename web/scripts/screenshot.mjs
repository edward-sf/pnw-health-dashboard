import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "..");
const out = resolve(webDir, "../docs/images/explorer.png");
const origin = "http://localhost:4174";
const url = `${origin}/pnw-health-dashboard/?mode=model&c=53033`;

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview did not start in time");
}

const server = spawn("npx", ["vite", "preview", "--port", "4174", "--strictPort"], {
  cwd: webDir,
  stdio: "ignore",
});

try {
  await waitForServer();
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
