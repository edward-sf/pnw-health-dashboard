import { expect, test as base } from "@playwright/test";

/**
 * Slows the page's CPU when E2E_CPU_THROTTLE is a number above 1, to mimic the CI runner (several
 * times slower than a dev machine). A no-op otherwise, and on non-Chromium browsers.
 */
const rate = Number(process.env.E2E_CPU_THROTTLE);

export const test = base.extend<{ cpuThrottle: void }>({
  cpuThrottle: [
    async ({ page, browserName }, use) => {
      if (browserName === "chromium" && Number.isFinite(rate) && rate > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
