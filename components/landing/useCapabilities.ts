"use client";

import { useEffect, useState } from "react";

/**
 * What the scene is allowed to do on this device.
 *
 * Three separate questions, deliberately not collapsed into one "is it fast"
 * flag, because they have different answers:
 *
 *   reducedMotion - an accessibility preference. Honouring it means no scroll
 *                   camera and no undulation, not merely a slower version.
 *   compact       - a layout question (under 768px). Drives particle count,
 *                   mesh resolution and whether postprocessing runs at all.
 *   maxDpr        - a fill-rate question. A phone at devicePixelRatio 3 asks
 *                   the GPU for nine times the pixels of a DPR-1 screen for a
 *                   difference nobody can see on a glowing wireframe.
 */
export interface Capabilities {
  readonly reducedMotion: boolean;
  readonly compact: boolean;
  readonly maxDpr: number;
  readonly postprocessing: boolean;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const COMPACT_QUERY = "(max-width: 767px)";

function readQuery(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

function snapshot(): Capabilities {
  const reducedMotion = readQuery(REDUCED_MOTION_QUERY);
  const compact = readQuery(COMPACT_QUERY);
  return {
    reducedMotion,
    compact,
    maxDpr: compact ? 1.5 : 2,
    postprocessing: !compact && !reducedMotion,
  };
}

export function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] = useState<Capabilities>(snapshot);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const lists = [window.matchMedia(REDUCED_MOTION_QUERY), window.matchMedia(COMPACT_QUERY)];
    const update = (): void => setCapabilities(snapshot());

    update();
    for (const list of lists) list.addEventListener("change", update);
    return () => {
      for (const list of lists) list.removeEventListener("change", update);
    };
  }, []);

  return capabilities;
}
