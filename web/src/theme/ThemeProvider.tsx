import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { DARK_QUERY, readChoice, resolveTheme, type Theme, type ThemeChoice, writeChoice } from "./theme";

type ThemeState = { choice: ThemeChoice; theme: Theme; setChoice(c: ThemeChoice): void };

// Outside a provider (unit tests that render one component) everything is light and fixed.
const LIGHT: ThemeState = { choice: "light", theme: "light", setChoice: () => {} };

const ThemeContext = createContext<ThemeState>(LIGHT);

/**
 * Holds the theme choice (kept in localStorage) and applies it as the `dark` class on <html>.
 * index.html's inline script sets the same class before first paint, so this only keeps it in
 * step as the choice or, under System, the OS setting changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const systemDark = useMediaQuery(DARK_QUERY);
  const theme = resolveTheme(choice, systemDark);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<ThemeState>(
    () => ({
      choice,
      theme,
      setChoice: (c) => {
        writeChoice(c);
        setChoiceState(c);
      },
    }),
    [choice, theme],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
