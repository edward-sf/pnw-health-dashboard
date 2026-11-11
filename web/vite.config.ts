import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "/pnw-health-dashboard/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**", "playwright-report/**", "test-results/**"],
    setupFiles: "./src/test/setup.ts",
  },
});
