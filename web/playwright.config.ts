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
      testMatch: /(mobile|a11y|stage)\.spec\.ts/,
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
