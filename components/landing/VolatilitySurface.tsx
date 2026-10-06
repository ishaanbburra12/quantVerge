"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { IUniform, ShaderMaterial } from "three";
import { Color, DoubleSide } from "three";
import { SURFACE_FRAGMENT_SHADER, SURFACE_VERTEX_SHADER } from "./surfaceShader";

interface SurfaceUniforms {
  readonly [name: string]: IUniform<unknown>;
  uTime: IUniform<number>;
  uAmplitude: IUniform<number>;
  uBreath: IUniform<number>;
  uAccent: IUniform<Color>;
  uDeep: IUniform<Color>;
  uGridDensity: IUniform<number>;
  uOpacity: IUniform<number>;
}

export interface VolatilitySurfaceProps {
  /** Grid segments per side. Vertex count is the square of this, so it is the
   *  single biggest lever on GPU cost. */
  readonly segments: number;
  readonly accent: string;
  readonly deep: string;
  /** False freezes the undulation for prefers-reduced-motion. */
  readonly animate: boolean;
  readonly speed: number;
}

export function VolatilitySurface({
  segments,
  accent,
  deep,
  animate,
  speed,
}: VolatilitySurfaceProps): React.ReactElement {
  const material = useRef<ShaderMaterial>(null);

  const uniforms = useMemo<SurfaceUniforms>(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 2.6 },
      // Reduced motion keeps the smile and the term structure — which are the
      // informative part of the shape — and removes only the movement.
      uBreath: { value: animate ? 1 : 0.45 },
      uAccent: { value: new Color(accent) },
      uDeep: { value: new Color(deep) },
      uGridDensity: { value: 64 },
      uOpacity: { value: 1 },
    }),
    [accent, deep, animate],
  );

  useFrame((_state, delta) => {
    if (!animate) return;
    const current = material.current;
    if (!current) return;
    // Driving the clock from the frame delta rather than from elapsed time
    // means a dropped frame slows the motion instead of teleporting it.
    uniforms.uTime.value += Math.min(delta, 1 / 30) * speed;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
      <planeGeometry args={[26, 22, segments, segments]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={SURFACE_VERTEX_SHADER}
        fragmentShader={SURFACE_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
