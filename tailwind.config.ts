import type { Config } from "tailwindcss";

/**
 * Tailwind is configured to read colours from CSS custom properties rather than
 * hard-coded hex values. That indirection is what makes theme switching work
 * without duplicating every utility class: `bg-surface` resolves to
 * `var(--surface)`, and the value of that variable changes with the theme.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-sunken": "var(--surface-sunken)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        accent: "var(--accent)",
        "accent-muted": "var(--accent-muted)",
        "accent-ink": "var(--accent-ink)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        caution: "var(--caution)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "10px",
      },
      maxWidth: {
        content: "1240px",
        prose: "68ch",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "draw-line": { from: { strokeDashoffset: "1" }, to: { strokeDashoffset: "0" } },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.5s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
