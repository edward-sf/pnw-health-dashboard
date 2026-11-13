export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

/** The localStorage key; the inline script in index.html reads the same key before first paint. */
export const STORAGE_KEY = "pnw-theme";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

const CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

/** The stored choice, or "system" when there is none, it is unrecognised, or storage is blocked. */
export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return CHOICES.find((c) => c === v) ?? "system";
  } catch {
    return "system";
  }
}

/** Stores the choice; a blocked or full store is ignored (the choice then lasts this page only). */
export function writeChoice(c: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, c);
  } catch {
    // Storage is unavailable; the theme still applies until the page is reloaded.
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}
