"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Research Mode.
 *
 * Normal mode shows the experiment and its interpretation. Research Mode adds
 * the machinery a reviewer would need in order to disagree with you: the exact
 * equations, the assumptions, the seed, the raw statistics, and the export.
 *
 * The idea is that beginner-friendliness and rigour do not have to compete — the
 * rigorous material is always present in the page, just folded away by default.
 */
interface ResearchModeContextValue {
  researchMode: boolean;
  toggleResearchMode: () => void;
}

const ResearchModeContext = createContext<ResearchModeContextValue>({
  researchMode: false,
  toggleResearchMode: () => {},
});

const STORAGE_KEY = "quantlab.researchMode";

export function ResearchModeProvider({ children }: { children: ReactNode }) {
  const [researchMode, setResearchMode] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "true") setResearchMode(true);
    } catch {
      /* Ignore unavailable storage. */
    }
  }, []);

  const toggleResearchMode = useCallback(() => {
    setResearchMode((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* Ignore unavailable storage. */
      }
      return next;
    });
  }, []);

  return (
    <ResearchModeContext.Provider value={{ researchMode, toggleResearchMode }}>
      {children}
    </ResearchModeContext.Provider>
  );
}

export function useResearchMode(): ResearchModeContextValue {
  return useContext(ResearchModeContext);
}
