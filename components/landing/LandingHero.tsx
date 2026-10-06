"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { Scene } from "./Scene";
import { useCapabilities } from "./useCapabilities";

/**
 * The three scroll beats.
 *
 * `enter` and `exit` are positions on a normalised 0-to-1 scroll timeline, and
 * they are the numbers to edit if the pacing feels wrong. The camera keyframes
 * they are paired with live in CAMERA_BEATS in Scene.tsx; the two lists are
 * kept in the same order on purpose, so beat n's text arrives as the camera
 * settles into keyframe n.
 */
interface Beat {
  readonly eyebrow: string;
  readonly title: string;
  readonly accentTitle?: string;
  readonly body: string;
  readonly enter: number;
  readonly exit: number | null;
}

const BEATS: readonly Beat[] = [
  {
    eyebrow: "Quantitative research laboratory",
    title: "QUANT",
    accentTitle: "VERGE",
    body: "Experiment with the mathematics behind markets. Every number on this site is computed in your browser, from a seed you control.",
    enter: 0,
    exit: 0.22,
  },
  {
    eyebrow: "Sixteen laboratories",
    title: "Interactive Labs",
    body: "Monte Carlo, regime switching, portfolio optimisation, options, fixed income, credit. Each one states its assumptions before its results, and its limitations after them.",
    enter: 0.36,
    exit: 0.62,
  },
  {
    eyebrow: "Written from scratch",
    title: "Math Library",
    body: "Hart's normal CDF, cyclic Jacobi eigendecomposition, Nelder-Mead, GARCH by maximum likelihood. No numerical dependencies, and a test suite that checks the mathematics rather than the output.",
    enter: 0.78,
    exit: null,
  },
];

/**
 * How much scroll the pinned stage consumes, as a percentage of viewport
 * height. Of this, the first 100vh is the stage itself, so the scrubbed range
 * is RUNWAY_VH - 100.
 *
 * The number is set by the last beat rather than by taste. "Math Library"
 * finishes arriving at timeline position 0.88, which leaves 12% of the range
 * afterwards — and that remainder is not dead, because the camera is still
 * interpolating toward its final keyframe through it. Any longer and the stage
 * holds you on text that has stopped moving while the page below waits.
 */
const RUNWAY_VH = 290;

export function LandingHero(): React.ReactElement {
  const capabilities = useCapabilities();
  const { reducedMotion } = capabilities;

  const runway = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** Written by GSAP, read by useFrame inside the Canvas. Never React state. */
  const progress = useRef(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.current = 0;
      return;
    }

    const element = runway.current;
    if (!element) return;

    gsap.registerPlugin(ScrollTrigger);

    // Lenis owns the scroll position; ScrollTrigger must be told when it moves,
    // and must not also be driven by its own rAF, or the two fight and the
    // camera stutters. Hence autoRaf: false plus a single gsap ticker callback.
    const lenis = new Lenis({ autoRaf: false, duration: 1.1, smoothWheel: true });
    const raf = (time: number): void => lenis.raf(time * 1000);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: element,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self) => {
            progress.current = self.progress;
          },
        },
      });

      // Pin the timeline to exactly one second long. Without this its duration
      // would be set by whatever its last tween happens to end at, and scrub
      // maps the scroll range onto that duration — so every `enter` and `exit`
      // below would silently be rescaled by 1/duration and arrive late.
      timeline.to({}, { duration: 1 }, 0);

      BEATS.forEach((beat, index) => {
        const node = beatRefs.current[index];
        if (!node) return;

        gsap.set(node, { opacity: index === 0 ? 1 : 0, y: index === 0 ? 0 : 28 });

        if (index > 0) {
          timeline.to(node, { opacity: 1, y: 0, ease: "power2.out", duration: 0.1 }, beat.enter);
        }
        if (beat.exit !== null) {
          timeline.to(node, { opacity: 0, y: -24, ease: "power2.in", duration: 0.1 }, beat.exit);
        }
      });

      const cue = element.querySelector("[data-scroll-cue]");
      if (cue) timeline.to(cue, { opacity: 0, ease: "none", duration: 0.08 }, 0.12);
    }, element);

    return () => {
      context.revert();
      gsap.ticker.remove(raf);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return (
    <section className="relative border-b border-line bg-[#05070b] text-white">
      <div ref={runway} style={{ height: reducedMotion ? undefined : `${RUNWAY_VH}vh` }}>
        <div
          className={
            reducedMotion
              ? "relative overflow-hidden"
              : "sticky top-0 h-[100svh] overflow-hidden"
          }
        >
          {/* The canvas is decorative; every word it illustrates is in the DOM
              below it as real text. */}
          <div aria-hidden="true" className="absolute inset-0">
            <div className="landing-fallback absolute inset-0" />
            <Scene progress={progress} capabilities={capabilities} />
            <div className="landing-scrim absolute inset-0" />
          </div>

          <div
            className={
              reducedMotion
                ? "relative mx-auto flex max-w-content flex-col gap-12 px-4 py-20 sm:px-6"
                : "relative mx-auto flex h-full max-w-content items-center px-4 sm:px-6"
            }
          >
            {BEATS.map((beat, index) => (
              <div
                key={beat.title}
                ref={(node) => {
                  beatRefs.current[index] = node;
                }}
                className={
                  reducedMotion
                    ? "max-w-xl"
                    : "absolute left-4 top-[13vh] max-w-xl sm:left-6 sm:top-auto lg:left-[max(1.5rem,calc((100vw-1240px)/2+1.5rem))]"
                }
              >
                <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-[#38d6f0]">
                  {beat.eyebrow}
                </p>
                {index === 0 ? (
                  <h1 className="mt-4 text-5xl font-semibold tracking-[-0.03em] sm:text-7xl">
                    {beat.title}
                    <span className="text-[#38d6f0]">{beat.accentTitle}</span>
                  </h1>
                ) : (
                  <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">
                    {beat.title}
                  </h2>
                )}
                <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/70 sm:text-base">
                  {beat.body}
                </p>

                {index === 0 ? (
                  <div className="mt-8 flex flex-wrap gap-2.5">
                    <Link
                      href="/labs"
                      className="rounded-md bg-[#38d6f0] px-4 py-2 text-sm font-medium text-[#05070b] transition-all hover:brightness-110"
                    >
                      Explore Labs
                    </Link>
                    <Link
                      href="/research"
                      className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/40"
                    >
                      View Research
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={index === 1 ? "/labs" : "/learn/notes"}
                    className="mt-6 inline-block text-xs font-medium text-[#38d6f0] hover:underline"
                  >
                    {index === 1 ? "Open the labs →" : "Read the walkthroughs →"}
                  </Link>
                )}
              </div>
            ))}
          </div>

          {!reducedMotion ? (
            <p
              aria-hidden="true"
              data-scroll-cue=""
              className="absolute bottom-6 left-1/2 -translate-x-1/2 text-2xs uppercase tracking-[0.3em] text-white/30"
            >
              Scroll
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
