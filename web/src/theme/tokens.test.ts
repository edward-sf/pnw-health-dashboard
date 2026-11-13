import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { contrastRatio } from "../color/contrast";
import { PALETTES } from "../color/palette";
import type { Theme } from "./theme";

// The color tokens as shipped: the top-level `:root` block (light) and the `.dark` block.
const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function block(selector: string): Record<string, string> {
  const re = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const body = re.exec(css)?.[1];
  if (!body) throw new Error(`no top-level ${selector} block in styles.css`);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const TOKENS: Record<Theme, Record<string, string>> = { light: block(":root"), dark: block(".dark") };
const isColor = (v: string) => /^#[0-9a-fA-F]{3,8}$/.test(v) || v.includes("rgb(");

test("the dark block redefines every color token in :root", () => {
  const colors = Object.entries(TOKENS.light).filter(([, v]) => isColor(v)).map(([k]) => k);
  expect(colors.length).toBeGreaterThan(10);
  for (const name of colors) expect(TOKENS.dark, name).toHaveProperty(name);
});

describe.each(Object.keys(TOKENS) as Theme[])("%s tokens", (theme) => {
  const t = (name: string): string => {
    const v = TOKENS[theme][name];
    if (!v || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`${theme} ${name} is not #rrggbb: ${v}`);
    return v;
  };
  const atLeast = (fg: string, bg: string, min: number) =>
    expect(contrastRatio(t(fg), t(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);

  // The palette is what the map's outlines are computed against, so it must be the stage drawn.
  test("--stage is the palette's stage", () => {
    expect(t("--stage")).toBe(PALETTES[theme].stage);
  });

  test("text tokens are 4.5:1 on their surfaces", () => {
    for (const bg of ["--paper", "--surface", "--wash", "--stage"]) {
      atLeast("--ink", bg, 4.5);
      atLeast("--ink-muted", bg, 4.5);
    }
    for (const bg of ["--paper", "--surface", "--fir-soft"]) {
      atLeast("--fir", bg, 4.5);
      atLeast("--ink", bg, 4.5);
    }
    atLeast("--alert", "--surface", 4.5);
    atLeast("--chart-ink", "--surface", 4.5);
    // The map tooltip: surface-colored text on an ink box.
    atLeast("--surface", "--ink", 4.5);
  });

  test("control borders and map strokes are 3:1 against what they sit on", () => {
    atLeast("--line-strong", "--surface", 3);
    atLeast("--line-strong", "--paper", 3);
    atLeast("--map-state-border", "--stage", 3);
    atLeast("--map-inset-frame", "--stage", 3);
    atLeast("--swatch-border", "--stage", 3);
    atLeast("--swatch-border", "--surface", 3);
    atLeast("--map-selected", "--map-selected-under", 3);
    atLeast("--map-selected", "--stage", 3);
    atLeast("--chart-muted", "--surface", 3);
  });

  test("the state border is 3:1 against the palette's stage", () => {
    expect(contrastRatio(t("--map-state-border"), PALETTES[theme].stage)).toBeGreaterThanOrEqual(3);
  });
});
