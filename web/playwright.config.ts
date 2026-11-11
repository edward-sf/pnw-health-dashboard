import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: "http://localhost:4173/pnw-health-dashboard/" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/pnw-health-dashboard/",
    reuseExistingServer: !process.env.CI,
  },
});
