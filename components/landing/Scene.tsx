"use client";

import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Vector3 } from "three";
import { VolatilitySurface } from "./VolatilitySurface";
import { TickField } from "./TickField";
import type { Capabilities } from "./useCapabilities";

/** Near-black page, one accent. Both are plain hex so the shader can read them
 *  without going through the CSS custom properties, which change with theme. */
export const SCENE_BACKGROUND = "#05070b";
export const SCENE_ACCENT = "#38d6f0";
export const SCENE_DEEP = "#132033";
/** Phones skip postprocessing, so the bloom that lifts the grid on desktop is
 *  absent. A brighter accent compensates rather than leaving the mesh murky. */
export const SCENE_ACCENT_COMPACT = "#74e8fb";

/**
 * The camera path, as three keyframes — one per scroll beat.
 *
 * `at` is where the camera sits, `look` is what it points at. Beat 1 sits low
 * and close so the surface rises past the lens; beat 2 climbs and pulls back so
 * the whole mesh resolves into a grid again.
 */
interface CameraBeat {
  readonly at: readonly [number, number, number];
  readonly look: readonly [number, number, number];
}

export const CAMERA_BEATS: readonly CameraBeat[] = [
  { at: [0, 3.5, 11.5], look: [0, 0.3, -1] },
  { at: [0.6, 0.15, 2.4], look: [-0.4, 1.1, -7] },
  { at: [0, 6.6, 15.5], look: [0, -0.6, -1] },
];

function sampleBeats(progress: number, outAt: Vector3, outLook: Vector3): void {
  const segments = CAMERA_BEATS.length - 1;
  const scaled = Math.min(Math.max(progress, 0), 1) * segments;
  const index = Math.min(Math.floor(scaled), segments - 1);
  const local = scaled - index;

  // smoothstep between keyframes: the camera leaves and arrives at rest, which
  // is what stops the transition reading as a jerk at the beat boundaries.
  const eased = local * local * (3 - 2 * local);

  const a = CAMERA_BEATS[index];
  const b = CAMERA_BEATS[index + 1];

  outAt.set(
    a.at[0] + (b.at[0] - a.at[0]) * eased,
    a.at[1] + (b.at[1] - a.at[1]) * eased,
    a.at[2] + (b.at[2] - a.at[2]) * eased,
  );
  outLook.set(
    a.look[0] + (b.look[0] - a.look[0]) * eased,
    a.look[1] + (b.look[1] - a.look[1]) * eased,
    a.look[2] + (b.look[2] - a.look[2]) * eased,
  );
}

interface CameraRigProps {
  readonly progress: RefObject<number>;
  readonly damping: number;
  readonly parallax: boolean;
  /** Portrait phones see far less of the surface at the desktop framing, so the
   *  whole path is pulled lower and closer rather than re-authored. */
  readonly compact: boolean;
  /** False under prefers-reduced-motion: the camera is placed once and the
   *  render loop is allowed to go idle. */
  readonly animating: boolean;
}

/**
 * Reads scroll progress out of a ref rather than a prop.
 *
 * This is the whole reason the scene stays at 60fps while scrolling: GSAP
 * writes a number into the ref on every scroll tick, and useFrame reads it.
 * React never re-renders. Passing progress as state would reconcile the entire
 * scene graph several times per scrolled pixel.
 */
function CameraRig({ progress, damping, parallax, compact, animating }: CameraRigProps): null {
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);

  const invalidate = useThree((state) => state.invalidate);

  const targetAt = useMemo(() => new Vector3(), []);
  const targetLook = useMemo(() => new Vector3(), []);
  const currentLook = useMemo(() => new Vector3(...CAMERA_BEATS[0].look), []);

  // Reduced motion runs the loop on demand, so useFrame fires at most once and
  // the smoothing below would never converge — the camera would keep its
  // default orientation and point past the surface entirely. Place it outright.
  useEffect(() => {
    if (animating) return;
    sampleBeats(0, targetAt, targetLook);
    if (compact) {
      targetAt.y *= 0.92;
      targetAt.z *= 0.8;
      targetLook.y -= 0.45;
    }
    camera.position.copy(targetAt);
    currentLook.copy(targetLook);
    camera.lookAt(currentLook);
    invalidate();
  }, [animating, compact, camera, invalidate, targetAt, targetLook, currentLook]);

  useFrame((_state, delta) => {
    if (!animating) return;
    sampleBeats(progress.current ?? 0, targetAt, targetLook);

    if (compact) {
      targetAt.y *= 0.92;
      targetAt.z *= 0.80;
      targetLook.y -= 0.45;
    }

    if (parallax) {
      targetAt.x += pointer.x * 0.55;
      targetAt.y += pointer.y * 0.3;
    }

    // Exponential smoothing written frame-rate independently. A plain
    // lerp(0.1) would move twice as fast on a 120Hz display.
    const k = 1 - Math.exp(-damping * Math.min(delta, 1 / 20));
    camera.position.lerp(targetAt, k);
    currentLook.lerp(targetLook, k);
    camera.lookAt(currentLook);
  });

  return null;
}

export interface SceneProps {
  readonly progress: RefObject<number>;
  readonly capabilities: Capabilities;
  /** Multiplies the surface undulation and tick drift. 1 is the tuned default. */
  readonly speed?: number;
}

export function Scene({ progress, capabilities, speed = 1 }: SceneProps): React.ReactElement {
  const { compact, reducedMotion, maxDpr, postprocessing } = capabilities;

  return (
    <Canvas
      // dpr as a [min, max] pair lets R3F settle on something the device can
      // actually sustain instead of always asking for the native ratio.
      dpr={[1, maxDpr]}
      gl={{ antialias: !compact, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: compact ? 62 : 52, near: 0.1, far: 120, position: [...CAMERA_BEATS[0].at] }}
      // Static scenes do not need a render loop at all; "demand" draws only
      // when something invalidates, which on reduced motion is almost never.
      frameloop={reducedMotion ? "demand" : "always"}
    >
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <fog attach="fog" args={[SCENE_BACKGROUND, compact ? 14 : 12, compact ? 46 : 34]} />

      <CameraRig
        progress={progress}
        damping={reducedMotion ? 60 : 4.5}
        parallax={!compact && !reducedMotion}
        compact={compact}
        animating={!reducedMotion}
      />

      <VolatilitySurface
        segments={compact ? 96 : 168}
        accent={compact ? SCENE_ACCENT_COMPACT : SCENE_ACCENT}
        deep={SCENE_DEEP}
        animate={!reducedMotion}
        speed={speed}
      />

      <TickField
        count={compact ? 220 : 720}
        accent={compact ? SCENE_ACCENT_COMPACT : SCENE_ACCENT}
        animate={!reducedMotion}
        speed={speed}
      />

      {postprocessing ? (
        <EffectComposer>
          <Bloom intensity={0.9} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      ) : null}
    </Canvas>
  );
}
