/**
 * Eigendecomposition of real symmetric matrices, by the cyclic Jacobi method.
 *
 * A covariance or correlation matrix is always symmetric, which buys a great
 * deal: its eigenvalues are guaranteed real, its eigenvectors orthogonal, and
 * the Jacobi method is guaranteed to converge. For general (non-symmetric)
 * matrices none of that holds and you need QR iteration with Hessenberg
 * reduction — far more machinery, none of it needed here.
 *
 * Jacobi works by repeatedly applying plane rotations, each chosen to annihilate
 * one off-diagonal element. Rotating reintroduces values at previously-zeroed
 * positions, but the sum of squares of the off-diagonal entries strictly
 * decreases at every step, so the matrix converges to diagonal form. The
 * accumulated rotations are the eigenvectors; the resulting diagonal holds the
 * eigenvalues.
 */

import type { Matrix } from "@/lib/math/linearAlgebra";

export interface Eigendecomposition {
  /** Eigenvalues, sorted descending. */
  values: number[];
  /** Eigenvectors as columns, in the same order as `values`. */
  vectors: Matrix;
  /** Jacobi sweeps performed before convergence. */
  iterations: number;
  converged: boolean;
}

/** Sum of squares of the strictly upper-triangular entries. */
function offDiagonalNorm(a: Matrix): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) sum += a[i][j] * a[i][j];
  }
  return sum;
}

/**
 * Decompose a real symmetric matrix.
 *
 * Throws on a non-symmetric input rather than silently returning a meaningless
 * answer — the algorithm assumes symmetry throughout, and feeding it an
 * asymmetric matrix produces numbers with no interpretation at all.
 */
export function eigenSymmetric(matrix: Matrix, maxSweeps = 100, tolerance = 1e-30): Eigendecomposition {
  const n = matrix.length;
  if (n === 0) return { values: [], vectors: [], iterations: 0, converged: true };

  for (let i = 0; i < n; i++) {
    if (matrix[i].length !== n) throw new Error("eigenSymmetric: matrix must be square");
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-9) {
        throw new Error("eigenSymmetric: matrix must be symmetric");
      }
    }
  }

  // Work on a copy; `v` accumulates the rotations and ends up holding the
  // eigenvectors as its columns.
  const a: Matrix = matrix.map((row) => [...row]);
  const v: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  let sweeps = 0;
  let converged = false;
  let previousNorm = Infinity;

  for (; sweeps < maxSweeps; sweeps++) {
    const norm = offDiagonalNorm(a);
    if (norm < tolerance) {
      converged = true;
      break;
    }
    // Jacobi converges quadratically, so it reaches machine precision quickly
    // and then stops improving. Continuing past that point burns sweeps without
    // reducing the error, so we stop when a sweep fails to make progress.
    //
    // The default tolerance is deliberately far below anything achievable in
    // float64: it means "run until no further progress", with this check rather
    // than the threshold doing the actual stopping. An earlier version used a
    // 1e-14 threshold on the SUM OF SQUARES, which sounds tight but allows
    // individual off-diagonal entries around 1e-7 — enough error that the
    // defining relation A*v = lambda*v only held to about seven digits.
    if (norm >= previousNorm) {
      converged = true;
      break;
    }
    previousNorm = norm;

    // One cyclic sweep: visit every off-diagonal position once.
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;

        // Choose the rotation angle that sends a[p][q] to exactly zero.
        // theta parameterises it; t is tan of the rotation angle, picked as the
        // SMALLER root for numerical stability — the larger root is a valid
        // rotation too but amplifies rounding error.
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // Apply the rotation to the matrix, exploiting symmetry so only the
        // affected rows and columns are touched.
        const app = a[p][p];
        const aqq = a[q][q];
        const apq = a[p][q];
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p][q] = 0;
        a[q][p] = 0;

        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[p][k] = a[k][p];
          a[k][q] = s * akp + c * akq;
          a[q][k] = a[k][q];
        }

        // Accumulate the rotation into the eigenvector matrix.
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  // Sort descending by eigenvalue, carrying the eigenvectors with them.
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y][y] - a[x][x]);
  const values = order.map((i) => a[i][i]);
  const vectors: Matrix = Array.from({ length: n }, (_, row) =>
    order.map((col) => v[row][col]),
  );

  // Fix the sign convention. An eigenvector is only defined up to sign, so
  // without a convention the output flips arbitrarily between runs and makes
  // loadings impossible to compare. We force the largest-magnitude component of
  // each vector to be positive.
  for (let col = 0; col < n; col++) {
    let maxRow = 0;
    for (let row = 1; row < n; row++) {
      if (Math.abs(vectors[row][col]) > Math.abs(vectors[maxRow][col])) maxRow = row;
    }
    if (vectors[maxRow][col] < 0) {
      for (let row = 0; row < n; row++) vectors[row][col] = -vectors[row][col];
    }
  }

  return { values, vectors, iterations: sweeps, converged };
}

/** Extract eigenvector `index` as a plain array. */
export function eigenvector(decomposition: Eigendecomposition, index: number): number[] {
  return decomposition.vectors.map((row) => row[index]);
}
