import { afterEach, expect, test, vi } from "vitest";
import { STORAGE_KEY, readChoice, resolveTheme, writeChoice } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("readChoice returns system when storage is empty, holds a bad value, or throws", () => {
  expect(readChoice()).toBe("system");

  localStorage.setItem(STORAGE_KEY, "purple");
  expect(readChoice()).toBe("system");

  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readChoice()).toBe("system");
});

test("readChoice returns a stored choice", () => {
  for (const c of ["light", "dark", "system"] as const) {
    localStorage.setItem(STORAGE_KEY, c);
    expect(readChoice()).toBe(c);
  }
});

test("writeChoice stores the choice", () => {
  writeChoice("dark");
  expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
});

test("writeChoice swallows a storage error", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => writeChoice("dark")).not.toThrow();
});

test("resolveTheme", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});
