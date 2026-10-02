"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggleTheme: () => {} });

const STORAGE_KEY = "quantverge.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start at "dark" to match the server-rendered markup. Reading localStorage
  // during the first render would produce a hydration mismatch, since the server
  // has no access to it.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        return;
      }
      // No stored preference: follow the operating system.
      if (window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
    } catch {
      // localStorage can throw in private browsing or with site data blocked.
      // A missing preference is not an error; the default theme still applies.
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* Persisting the choice is a convenience, not a requirement. */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
