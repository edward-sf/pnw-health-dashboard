import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/** The directories swept onto the token scale; later tasks add to this list. */
export const SWEPT: readonly string[] = [
  "src/components/ui",
  "src/explorer",
  "src/map",
  "src/panel",
  "src/table",
  "src/search",
  "src/pages",
  "src/brand",
  "src/App.tsx",
];

const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
const ARBITRARY_SIZE =
  /\b(?:rounded|text|p|px|py|m|mx|my|gap|w|h)-\[[\d.]+(?:px|rem)\]/;

/** The mark's sun is a literal: "sun is mark-only", so it is not a token. */
const EXEMPT = new Set([join("src", "brand", "BrandMark.tsx")]);

function tsxFiles(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") && !/\.test\.tsx$/.test(path) && !EXEMPT.has(path) ? [path] : [];
  });
}

test.each(SWEPT.flatMap(tsxFiles))("%s uses tokens, not raw values", (file) => {
  const source = readFileSync(file, "utf8");
  expect(source).not.toMatch(RAW_HEX);
  expect(source).not.toMatch(ARBITRARY_SIZE);
});

/** styles.css with the token blocks (`:root`, `.dark`, `@theme`) cut out. */
function cssOutsideTokenBlocks(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const rest = css.slice(i);
    const m = /^(:root|\.dark|@theme[^{]*)\s*\{/.exec(rest);
    if (m && (i === 0 || css[i - 1] === "\n")) {
      let depth = 0;
      let j = i + m[0].length - 1;
      for (; j < css.length; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}" && --depth === 0) break;
      }
      i = j + 1;
    } else {
      out += css[i++];
    }
  }
  return out;
}

test("styles.css sets radius and type size only from the scale", () => {
  const css = cssOutsideTokenBlocks(readFileSync("src/styles.css", "utf8"));
  const values = [
    ...css.matchAll(/(?:^|[\s;{])(border-radius|font-size):\s*([^;}]+)[;}]/g),
  ];
  expect(values.length).toBeGreaterThan(0);
  const bad = values
    .map((m) => `${m[1]}: ${m[2]!.trim()}`)
    .filter((v) => {
      const value = v.split(": ")[1]!;
      return !value
        .split(/\s+/)
        .every((part) => /^(var\(.+\)|0|inherit|100%)$/.test(part));
    });
  expect(bad).toEqual([]);
});
