import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Social-card URLs in index.html are absolute; fall back to the Pages origin when unset.
// public/404.html is copied unprocessed, so it hard-codes this origin and the base path, and
// src/brand/brand.ts repeats the fallback. brand.test.tsx checks all three agree; a host move
// changes all three.
process.env.VITE_SITE_ORIGIN ??= "https://edward-sf.github.io";

export default defineConfig({
  base: "/pnw-health-dashboard/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "e2e/**", "playwright-report/**", "test-results/**"],
    setupFiles: "./src/test/setup.ts",
  },
});
