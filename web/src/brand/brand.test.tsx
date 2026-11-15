import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { pageTitle, SITE_NAME, siteOrigin, TAGLINE } from "./brand";

test("names and titles", () => {
  expect(SITE_NAME).toBe("PNW Health Atlas");
  expect(TAGLINE).toBe("County health across Washington, Oregon, Idaho and Alaska.");
  expect(pageTitle()).toBe("PNW Health Atlas");
  expect(pageTitle("About")).toBe("About · PNW Health Atlas");
  expect(siteOrigin()).toMatch(/^https?:\/\//);
});

const head = (file: string) => {
  const html = readFileSync(file, "utf8")
    .replaceAll("%BASE_URL%", "/pnw-health-dashboard/")
    .replaceAll("%VITE_SITE_ORIGIN%", "https://edward-sf.github.io");
  const tags = html.match(/<(?:link|meta)\b[^>]*>/g) ?? [];
  const pick = (re: RegExp) => tags.filter((t) => re.test(t)).map((t) => t.replace(/\s+/g, " "));
  return {
    title: /<title>([^<]*)<\/title>/.exec(html)?.[1],
    tags: pick(/rel="(?:icon|apple-touch-icon)"|name="theme-color"|property="og:|name="twitter:/),
  };
};

test("404.html carries the same icon, theme-color and social tags as index.html", () => {
  const index = head("index.html");
  const notFound = head("public/404.html");
  expect(index.title).toBe("PNW Health Atlas");
  expect(notFound.title).toBe("PNW Health Atlas");
  expect(index.tags.length).toBeGreaterThanOrEqual(9);
  expect(notFound.tags).toEqual(index.tags);
});

test("404.html's literal origin and base match vite.config.ts and brand.ts", () => {
  const config = readFileSync("vite.config.ts", "utf8");
  const origin = /VITE_SITE_ORIGIN \?\?= "([^"]+)"/.exec(config)?.[1];
  const base = /base: "([^"]+)"/.exec(config)?.[1];
  expect(origin).toMatch(/^https:\/\//);
  expect(base).toMatch(/^\/.*\/$/);
  expect(readFileSync("src/brand/brand.ts", "utf8")).toContain(`?? "${origin}"`);
  const urls = [...readFileSync("public/404.html", "utf8").matchAll(/content="(https?:[^"]+)"/g)].map(
    (m) => m[1]!,
  );
  expect(urls.length).toBe(3);
  for (const url of urls) expect(url.startsWith(`${origin}${base}`), url).toBe(true);
});

test("the old site name is gone from web, the README and CONTRIBUTING", () => {
  const files = [
    "index.html",
    "public/404.html",
    "src/App.tsx",
    "src/pages/About.tsx",
    "src/pages/Methodology.tsx",
    "../README.md",
    "../CONTRIBUTING.md",
  ];
  for (const f of files) expect(readFileSync(f, "utf8"), f).not.toContain("PNW Health Dashboard");
});
