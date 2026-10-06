"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { IUniform, ShaderMaterial } from "three";
import { AdditiveBlending, BufferAttribute, Color } from "three";
import { TICK_FRAGMENT_SHADER, TICK_VERTEX_SHADER } from "./surfaceShader";

const SPAN = 14;

interface TickUniforms {
  readonly [name: string]: IUniform<unknown>;
  uTime: IUniform<number>;
  uSize: IUniform<number>;
  uSpan: IUniform<number>;
  uPixelRatio: IUniform<number>;
  uAccent: IUniform<Color>;
}

export interface TickFieldProps {
  readonly count: number;
  readonly accent: string;
  readonly animate: boolean;
  readonly speed: number;
}

/**
 * Faint drifting motes above the surface. Entirely GPU-side: positions are
 * uploaded once, and the upward drift plus the wrap at the top of the column
 * happen in the vertex shader, so the per-frame CPU cost is one uniform write
 * no matter how many points there are.
 */
export function TickField({ count, accent, animate, speed }: TickFieldProps): React.ReactElement {
  const material = useRef<ShaderMaterial>(null);
  const dpr = useThree((state) => state.viewport.dpr);

  const attributes = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const speeds = new Float32Array(count);

    // A fixed linear congruential generator rather than Math.random, so the
    // field is identical on every mount and screenshots are comparable.
    let state = 0x9e3779b9;
    const next = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (next() - 0.5) * 22;
      positions[i * 3 + 1] = next() * SPAN;
      positions[i * 3 + 2] = (next() - 0.5) * 18;
      seeds[i] = next();
      speeds[i] = 0.18 + next() * 0.42;
    }

    return {
      position: new BufferAttribute(positions, 3),
      aSeed: new BufferAttribute(seeds, 1),
      aSpeed: new BufferAttribute(speeds, 1),
    };
  }, [count]);

  const uniforms = useMemo<TickUniforms>(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 26 },
      uSpan: { value: SPAN },
      uPixelRatio: { value: dpr },
      uAccent: { value: new Color(accent) },
    }),
    [accent, dpr],
  );

  useFrame((_state, delta) => {
    if (!animate) return;
    if (!material.current) return;
    uniforms.uTime.value += Math.min(delta, 1 / 30) * speed;
  });

  return (
    <points position={[0, -2.4, 0]} frustumCulled={false}>
      <bufferGeometry
        attributes={{
          position: attributes.position,
          aSeed: attributes.aSeed,
          aSpeed: attributes.aSpeed,
        }}
      />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={TICK_VERTEX_SHADER}
        fragmentShader={TICK_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
