"use client";

import dynamic from "next/dynamic";

/**
 * The three.js bundle is loaded only on the client, and only for the home
 * route. Until it arrives, a CSS gradient stands in at the same height, so the
 * page does not reflow when the canvas mounts.
 */
export const LandingHero = dynamic(
  () => import("./LandingHero").then((module) => module.LandingHero),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="landing-fallback h-[100svh] border-b border-line bg-[#05070b]"
      />
    ),
  },
);
