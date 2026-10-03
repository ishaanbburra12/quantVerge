/**
 * Derivative-free optimisation by the Nelder-Mead simplex method.
 *
 * Needed for maximum likelihood estimation, where the objective is a
 * log-likelihood whose derivatives are awkward to write by hand and whose
 * surface can be flat or ridged near the optimum.
 *
 * Nelder-Mead maintains a simplex of n+1 points in n dimensions and repeatedly
 * replaces its worst vertex by reflecting it through the centroid of the others,
 * expanding if that helps a great deal and contracting if it does not. It needs
 * no gradients, which is its whole appeal; the cost is that it can stall on
 * badly scaled problems and offers no convergence guarantee.
 */

export interface OptimisationResult {
  /** The best parameter vector found. */
  x: number[];
  /** The objective value there. */
  value: number;
  iterations: number;
  converged: boolean;
}

/**
 * Minimise `objective` starting from `start`.
 *
 * `scale` sets the size of the initial simplex per dimension. It matters more
 * than it looks: a simplex far smaller than the curvature of the surface
 * converges prematurely to a point that is not a minimum, and one far larger
 * wanders. Pass something comparable to the uncertainty in each parameter.
 */
export function nelderMead(
  objective: (x: number[]) => number,
  start: number[],
  options: {
    scale?: number[];
    maxIterations?: number;
    tolerance?: number;
  } = {},
): OptimisationResult {
  const n = start.length;
  const maxIterations = options.maxIterations ?? 2000;
  const tolerance = options.tolerance ?? 1e-10;
  const scale = options.scale ?? start.map((v) => (Math.abs(v) > 1e-8 ? Math.abs(v) * 0.1 : 0.1));

  // Standard reflection, expansion, contraction and shrink coefficients.
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;

  // Build the initial simplex: the start point plus one perturbation per axis.
  const simplex: { x: number[]; f: number }[] = [{ x: [...start], f: objective(start) }];
  for (let i = 0; i < n; i++) {
    const point = [...start];
    point[i] += scale[i];
    simplex.push({ x: point, f: objective(point) });
  }

  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations++) {
    simplex.sort((a, b) => a.f - b.f);

    // Convergence requires BOTH that the vertices agree in objective value and
    // that the simplex has actually collapsed in parameter space.
    //
    // Testing the function spread alone is a trap: a simplex straddling the
    // minimum symmetrically has equal objective values at every vertex, so the
    // spread is exactly zero while the vertices are still far apart. On a 1-D
    // quadratic that reported convergence 0.1 away from the true minimum — a
    // wrong answer returned confidently, with converged === true.
    const spread = Math.abs(simplex[n].f - simplex[0].f);
    const magnitude = Math.abs(simplex[0].f) + Math.abs(simplex[n].f) + 1e-30;

    let diameter = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        const d = Math.abs(simplex[i].x[j] - simplex[0].x[j]);
        if (d > diameter) diameter = d;
      }
    }
    // Scale the domain criterion by the size of the parameters themselves, so it
    // behaves sensibly whether they are of order 1e-6 or 1e6.
    const domainScale = simplex[0].x.reduce((acc, v) => acc + Math.abs(v), 0) / n + 1e-30;

    if (spread / magnitude < tolerance && diameter / domainScale < Math.sqrt(tolerance)) {
      converged = true;
      break;
    }

    // Centroid of everything except the worst vertex.
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    }

    const worst = simplex[n];

    // Reflect the worst point through the centroid.
    const reflected = centroid.map((c, j) => c + alpha * (c - worst.x[j]));
    const fReflected = objective(reflected);

    if (fReflected < simplex[0].f) {
      // Reflection is the new best — try going further in the same direction.
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const fExpanded = objective(expanded);
      simplex[n] = fExpanded < fReflected ? { x: expanded, f: fExpanded } : { x: reflected, f: fReflected };
      continue;
    }

    if (fReflected < simplex[n - 1].f) {
      // Reflection is an improvement but not spectacular; accept it.
      simplex[n] = { x: reflected, f: fReflected };
      continue;
    }

    // Reflection failed; contract toward the better of the two.
    const useOutside = fReflected < worst.f;
    const target = useOutside ? reflected : worst.x;
    const contracted = centroid.map((c, j) => c + rho * (target[j] - c));
    const fContracted = objective(contracted);

    if (fContracted < Math.min(fReflected, worst.f)) {
      simplex[n] = { x: contracted, f: fContracted };
      continue;
    }

    // Everything failed: shrink the whole simplex toward the best vertex.
    const best = simplex[0];
    for (let i = 1; i <= n; i++) {
      const shrunk = best.x.map((b, j) => b + sigma * (simplex[i].x[j] - b));
      simplex[i] = { x: shrunk, f: objective(shrunk) };
    }
  }

  simplex.sort((a, b) => a.f - b.f);
  return { x: simplex[0].x, value: simplex[0].f, iterations, converged };
}
