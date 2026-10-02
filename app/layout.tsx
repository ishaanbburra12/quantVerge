import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ResearchModeProvider } from "@/components/providers/ResearchModeProvider";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://quantlab.example";

export const metadata: Metadata = {
  // metadataBase lets Next resolve relative Open Graph and canonical URLs. Without
  // it, social previews silently fall back to relative paths that crawlers cannot
  // follow.
  metadataBase: new URL(SITE_URL),
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
    siteName: "QuantLab",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "QuantLab — Experiment with the mathematics behind markets",
    description:
      "Ten interactive labs for probability, portfolio theory, risk and quantitative research. Educational and research-oriented; not investment advice.",
  },
  alternates: { canonical: "/" },
  category: "education",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
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
