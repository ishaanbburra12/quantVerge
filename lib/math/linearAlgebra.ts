/**
 * Small, dependency-free linear algebra.
 *
 * Portfolio theory is linear algebra in disguise: a portfolio is a vector of
 * weights, risk is a quadratic form, and diversification is a statement about
 * off-diagonal entries of a matrix.
 */

export type Matrix = number[][];
export type Vector = number[];

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error("dot: vectors must have equal length");
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function matrixVectorProduct(m: Matrix, v: Vector): Vector {
  if (m.length === 0) return [];
  if (m[0].length !== v.length) throw new Error("matrixVectorProduct: dimension mismatch");
  return m.map((row) => dot(row, v));
}

/**
 * The quadratic form w^T * M * w.
 *
 * This single expression is the portfolio variance, and it is worth seeing why.
 * Expanded, it is a double sum:
 *
 *   w^T S w = sum over i, j of w_i * w_j * Sigma_ij
 *
 * The i = j terms are w_i^2 * sigma_i^2 — each asset's own contribution. The
 * i != j terms are 2 * w_i * w_j * Cov(i, j) — the interaction terms. For n
 * assets there are n variance terms but n(n-1) covariance terms, so for any
 * reasonably sized portfolio, risk is dominated by HOW ASSETS MOVE TOGETHER, not
 * by how volatile they are individually. That is the mathematical content of
 * "diversification".
 */
export function quadraticForm(w: Vector, m: Matrix): number {
  return dot(w, matrixVectorProduct(m, w));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function transpose(m: Matrix): Matrix {
  if (m.length === 0) return [];
  return m[0].map((_, j) => m.map((row) => row[j]));
}

export function matrixMultiply(a: Matrix, b: Matrix): Matrix {
  if (a.length === 0 || b.length === 0) return [];
  if (a[0].length !== b.length) throw new Error("matrixMultiply: dimension mismatch");
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => dot(row, col)));
}

/**
 * Convert a correlation matrix and a vector of volatilities into a covariance
 * matrix.
 *
 *   Sigma_ij = rho_ij * sigma_i * sigma_j
 *
 * This is just the definition of correlation rearranged. It is the standard way
 * to let a user specify risk, because correlations are intuitive and bounded
 * while raw covariances are neither.
 */
export function covarianceFromCorrelation(correlation: Matrix, volatilities: Vector): Matrix {
  const n = volatilities.length;
  if (correlation.length !== n) throw new Error("covarianceFromCorrelation: dimension mismatch");
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => correlation[i][j] * volatilities[i] * volatilities[j]),
  );
}

/** The reverse: extract correlations from a covariance matrix. */
export function correlationFromCovariance(covariance: Matrix): Matrix {
  const n = covariance.length;
  const sd = Array.from({ length: n }, (_, i) => Math.sqrt(Math.max(0, covariance[i][i])));
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (sd[i] === 0 || sd[j] === 0) return i === j ? 1 : 0;
      return covariance[i][j] / (sd[i] * sd[j]);
    }),
  );
}

/**
 * Cholesky decomposition: factor a symmetric positive-definite matrix A into
 * L * L^T where L is lower-triangular.
 *
 * This is the engine for simulating CORRELATED random variables, and the trick
 * is elegant. If z is a vector of independent standard normals and we set
 * x = L * z, then the covariance of x is
 *
 *   Cov(x) = E[L z z^T L^T] = L * E[z z^T] * L^T = L * I * L^T = L L^T = A
 *
 * So multiplying independent noise by L produces noise with exactly the
 * covariance we wanted. Everything in the Correlation Lab and the multi-asset
 * portfolio simulations depends on this.
 *
 * Returns null when the matrix is not positive definite, which happens with
 * inconsistent user-specified correlations — for instance claiming A and B are
 * +0.9 correlated, B and C are +0.9, but A and C are -0.9. That combination is
 * geometrically impossible, and the failure of the decomposition is how we
 * detect it. We surface that to the user rather than silently producing garbage.
 */
export function cholesky(matrix: Matrix): Matrix | null {
  const n = matrix.length;
  const L: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const diagonal = matrix[i][i] - sum;
        // A non-positive diagonal means the matrix is not positive definite.
        if (diagonal <= 1e-12) return null;
        L[i][j] = Math.sqrt(diagonal);
      } else {
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Is this matrix a valid correlation matrix? It must be symmetric, have 1 on
 * the diagonal, and be positive semi-definite.
 */
export function isValidCorrelationMatrix(m: Matrix): { valid: boolean; reason?: string } {
  const n = m.length;
  for (let i = 0; i < n; i++) {
    if (m[i].length !== n) return { valid: false, reason: "Matrix is not square." };
    if (Math.abs(m[i][i] - 1) > 1e-9) return { valid: false, reason: "Diagonal entries must all equal 1." };
    for (let j = 0; j < n; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > 1e-9) return { valid: false, reason: "Matrix is not symmetric." };
      if (m[i][j] < -1 - 1e-9 || m[i][j] > 1 + 1e-9) {
        return { valid: false, reason: "Correlations must lie between -1 and +1." };
      }
    }
  }
  // Add a tiny ridge before testing: a legitimate matrix can be positive
  // SEMI-definite (an exact +1 correlation pair), which Cholesky rejects even
  // though the matrix is admissible.
  const ridged = m.map((row, i) => row.map((v, j) => (i === j ? v + 1e-10 : v)));
  if (cholesky(ridged) === null) {
    return {
      valid: false,
      reason: "These correlations are mutually inconsistent — no set of assets could produce them.",
    };
  }
  return { valid: true };
}

/**
 * Solve A x = b by Gaussian elimination with partial pivoting.
 *
 * Partial pivoting — swapping in the row with the largest leading entry — is not
 * optional. Without it, a small pivot divides the rest of the row by a near-zero
 * number and amplifies rounding error catastrophically.
 */
export function solve(A: Matrix, b: Vector): Vector | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-14) return null; // singular
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

/** Invert a matrix by solving against each column of the identity. */
export function invert(A: Matrix): Matrix | null {
  const n = A.length;
  const columns: Vector[] = [];
  for (let i = 0; i < n; i++) {
    const e = new Array(n).fill(0);
    e[i] = 1;
    const col = solve(A, e);
    if (col === null) return null;
    columns.push(col);
  }
  return transpose(columns);
}
