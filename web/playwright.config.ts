import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { open: "never" }]],
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173/pnw-health-dashboard/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(mobile|pages404)\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /(mobile|a11y|stage|keyboard)\.spec\.ts/,
    },
    {
      // Real 404 responses, like GitHub Pages, so the 404.html deep-link redirect runs.
      name: "pages",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:4175/pnw-health-dashboard/",
      },
      testMatch: /pages404\.spec\.ts/,
    },
    // Opt-in cross-browser check: E2E_ALL_BROWSERS=1. PR ci does not run these.
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
            // Not mobile.spec: it needs touch and a phone viewport, which Desktop Firefox lacks
            // (Firefox cannot emulate mobile), so it fails by construction.
            testMatch: /(smoke|stage|brand)\.spec\.ts/,
          },
          {
            name: "mobile-safari",
            use: { ...devices["iPhone 14"] },
            testMatch: /(smoke|mobile|stage|brand)\.spec\.ts/,
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: "npm run preview -- --port 4173 --strictPort",
      url: "http://localhost:4173/pnw-health-dashboard/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node e2e/pages-server.mjs dist 4175",
      url: "http://localhost:4175/pnw-health-dashboard/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
