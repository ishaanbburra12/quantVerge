import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ResearchModeProvider } from "@/components/providers/ResearchModeProvider";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "QuantLab — Experiment with the mathematics behind markets",
    template: "%s — QuantLab",
  },
  description:
    "An interactive laboratory for probability, statistics, portfolio theory, market simulation, risk and quantitative research. Educational and research-oriented; not investment advice.",
  keywords: [
    "quantitative finance", "Monte Carlo simulation", "portfolio optimisation", "Black-Scholes",
    "market regimes", "backtesting", "overfitting", "value at risk", "educational",
  ],
  authors: [{ name: "QuantLab" }],
  openGraph: {
    title: "QuantLab — Experiment with the mathematics behind markets",
    description:
      "An interactive laboratory for probability, statistics, portfolio theory, market simulation, risk and quantitative research.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-theme` is set here so the server markup and the first client render
    // agree; the provider updates it after reading the stored preference.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <ResearchModeProvider>
            <Navigation />
            <main id="main">{children}</main>
            <Footer />
          </ResearchModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
