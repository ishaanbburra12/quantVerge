/**
 * Chart downsampling.
 *
 * A 10,000-step simulation plotted into an 800-pixel-wide chart asks the browser
 * to draw twelve points per pixel. That costs real time and shows the user
 * nothing extra. But naive decimation — keeping every nth point — is actively
 * misleading on financial data, because it can skip straight over a crash: the
 * single most important feature of the series disappears because it fell on an
 * unlucky index.
 *
 * Largest-Triangle-Three-Buckets solves this. It divides the series into buckets
 * and keeps, from each, the point forming the largest triangle with the previous
 * kept point and the average of the next bucket. Area is a proxy for visual
 * significance, so peaks and troughs survive while flat stretches collapse.
 */
export interface Point {
  x: number;
  y: number;
}

export function largestTriangleThreeBuckets(data: Point[], threshold: number): Point[] {
  const n = data.length;
  if (threshold >= n || threshold < 3) return data;

  const sampled: Point[] = [data[0]];
  // Buckets exclude the first and last points, which are always kept.
  const bucketSize = (n - 2) / (threshold - 2);
  let previous = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Average of the NEXT bucket, used as the triangle's third vertex.
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    let avgX = 0;
    let avgY = 0;
    const count = Math.max(1, nextEnd - nextStart);
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= count;
    avgY /= count;

    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1;
    const pointA = data[previous];

    let maxArea = -1;
    let maxIndex = rangeStart;
    for (let j = rangeStart; j < Math.min(rangeEnd, n); j++) {
      // Twice the triangle area; the factor of 2 is constant so it does not
      // affect which point wins.
      const area = Math.abs(
        (pointA.x - avgX) * (data[j].y - pointA.y) - (pointA.x - data[j].x) * (avgY - pointA.y),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }
    sampled.push(data[maxIndex]);
    previous = maxIndex;
  }

  sampled.push(data[n - 1]);
  return sampled;
}

/**
 * Downsample a plain numeric series, preserving index positions.
 * Returns objects so the chart keeps the true step number on the x axis.
 */
export function downsampleSeries(values: number[], maxPoints = 600): { index: number; value: number }[] {
  const points = values.map((value, index) => ({ x: index, y: value }));
  const reduced = largestTriangleThreeBuckets(points, maxPoints);
  return reduced.map((p) => ({ index: p.x, value: p.y }));
}

/**
 * Downsample several aligned series together on a SHARED set of indices.
 *
 * Using a different index set per series would misalign them in the tooltip and
 * make two lines appear to cross where they do not. We therefore choose the
 * indices once — from whichever series is most visually active — and sample all
 * the others at exactly those points.
 */
export function downsampleAligned(
  series: { key: string; values: (number | null)[] }[],
  maxPoints = 600,
): Record<string, number | null>[] {
  if (series.length === 0) return [];
  const length = Math.max(...series.map((s) => s.values.length));
  if (length <= maxPoints) {
    return Array.from({ length }, (_, i) => {
      const row: Record<string, number | null> = { index: i };
      for (const s of series) row[s.key] = s.values[i] ?? null;
      return row;
    });
  }

  // Pick the driving series: the one with the largest total absolute variation,
  // which is the one whose features most need preserving.
  let driver = series[0];
  let maxVariation = -1;
  for (const s of series) {
    let variation = 0;
    for (let i = 1; i < s.values.length; i++) {
      const a = s.values[i];
      const b = s.values[i - 1];
      if (a !== null && b !== null) variation += Math.abs(a - b);
    }
    if (variation > maxVariation) {
      maxVariation = variation;
      driver = s;
    }
  }

  const driverPoints: Point[] = [];
  driver.values.forEach((v, i) => {
    if (v !== null) driverPoints.push({ x: i, y: v });
  });
  const indices = largestTriangleThreeBuckets(driverPoints, maxPoints).map((p) => p.x);

  return indices.map((i) => {
    const row: Record<string, number | null> = { index: i };
    for (const s of series) row[s.key] = s.values[i] ?? null;
    return row;
  });
}

/**
 * Choose how many individual paths to DRAW out of however many were simulated.
 *
 * Beyond roughly 150 overlapping lines a chart becomes a solid block of colour:
 * more paths add rendering cost and subtract legibility. When the simulation is
 * larger than that, the labs draw a representative subset and show the full
 * population through percentile bands and the histogram instead — which is also
 * the statistically honest way to present it.
 */
export function pathsToRender(totalPaths: number, cap = 120): number {
  return Math.min(totalPaths, cap);
}
