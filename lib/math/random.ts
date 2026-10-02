/**
 * Seeded pseudo-random number generation.
 *
 * Reproducibility is a hard requirement for every experiment in QuantLab: the
 * same seed and the same parameters must always produce the same numbers. The
 * browser's `Math.random()` cannot do that — it has no seed — so we implement
 * our own generator.
 *
 * `mulberry32` is a small, fast 32-bit generator with a period of 2^32. That is
 * far too short for serious cryptography and short enough that you should not
 * use it for production-scale Monte Carlo with billions of draws, but it is
 * well-distributed and more than adequate for the simulation sizes here
 * (typically <10^7 draws).
 */

export type Rng = () => number;

/** Create a uniform [0, 1) generator from an integer seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard normal draws via the Box-Muller transform.
 *
 * Box-Muller turns two independent uniforms (u1, u2) into two independent
 * standard normals:
 *   z0 = sqrt(-2 ln u1) * cos(2*pi*u2)
 *   z1 = sqrt(-2 ln u1) * sin(2*pi*u2)
 *
 * We generate them in pairs and cache the spare, so the average cost is one
 * uniform pair per two normals. `u1` is guarded away from exactly 0, where
 * ln(0) would be -Infinity.
 */
export function normalSampler(rng: Rng): () => number {
  let spare: number | null = null;
  return function nextNormal(): number {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u1 = rng();
    while (u1 <= Number.EPSILON) u1 = rng();
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    spare = radius * Math.sin(theta);
    return radius * Math.cos(theta);
  };
}

/** Convenience: a seeded standard-normal generator. */
export function seededNormal(seed: number): () => number {
  return normalSampler(mulberry32(seed));
}

/**
 * Draw an index from a discrete probability distribution.
 * `weights` need not be normalised, but must be non-negative and sum to > 0.
 */
export function sampleDiscrete(weights: number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) throw new Error("sampleDiscrete: weights must sum to a positive number");
  const target = rng() * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (target < cumulative) return i;
  }
  return weights.length - 1;
}
