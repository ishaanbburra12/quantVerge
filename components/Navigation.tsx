"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useResearchMode } from "@/components/providers/ResearchModeProvider";

const NAV_ITEMS = [
  { href: "/labs", label: "Labs" },
  { href: "/research", label: "Research" },
  { href: "/projects", label: "Projects" },
  { href: "/challenges", label: "Challenges" },
  { href: "/learn", label: "Learn" },
  { href: "/about", label: "About" },
];

export function Navigation() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { researchMode, toggleResearchMode } = useResearchMode();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation, so it does not stay open over the new
  // page after a link is tapped.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      {/* A skip link is the single highest-value accessibility feature on a page
          with a long navigation bar. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-accent-ink"
      >
        Skip to content
      </a>

      <div className="mx-auto flex h-14 max-w-content items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="QuantVerge home">
          <LogoMark />
          <span className="text-sm font-semibold tracking-tight text-ink">
            Quant<span className="text-accent">Verge</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isActive(item.href) ? "bg-surface-raised text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <ResearchModeToggle researchMode={researchMode} onToggle={toggleResearchMode} />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:text-ink lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="animate-fade-in border-t border-line bg-surface px-4 py-2 lg:hidden"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`block rounded px-2 py-2 text-sm font-medium transition-colors ${
                isActive(item.href) ? "text-accent" : "text-ink-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

function ResearchModeToggle({ researchMode, onToggle }: { researchMode: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={researchMode}
      onClick={onToggle}
      title="Research Mode reveals equations, assumptions, seeds and raw statistics"
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-2xs font-medium transition-colors ${
        researchMode
          ? "border-accent bg-accent-muted/25 text-accent"
          : "border-line text-ink-faint hover:border-line-strong hover:text-ink-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${researchMode ? "bg-accent" : "bg-ink-faint"}`}
      />
      <span className="hidden sm:inline">Research mode</span>
      <span className="sm:hidden">Research</span>
    </button>
  );
}

/**
 * The logo is a decaying sine wave inside a square — a damped oscillation, which
 * is both a real mathematical object and a reference to mean reversion.
 */
function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="0.75" y="0.75" width="20.5" height="20.5" rx="4" stroke="var(--line-strong)" fill="var(--surface)" />
      <path
        d="M3 15.5 Q5.5 6.5 8 11 T13 11 T18 11"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="18" cy="11" r="1.5" fill="var(--accent)" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5Z" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
