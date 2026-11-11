import { expect, test } from "vitest";
import type { Indicator } from "../types";
import { sourceLine } from "./sourceLine";

const line = (source: Indicator["source"], year: number) =>
  sourceLine({ source, year } as Indicator);

test("labels the CHR year as a release", () => {
  expect(line("chr", 2025)).toBe("Source: County Health Rankings, 2025 release.");
});

test("shows data years for the other sources", () => {
  expect(line("places", 2023)).toBe("Source: CDC PLACES, 2023.");
  expect(line("acs", 2024)).toBe("Source: Census ACS 5-year, 2024.");
});
