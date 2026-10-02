import { describe, it, expect } from "vitest";
import { largestTriangleThreeBuckets, downsampleSeries, downsampleAligned, pathsToRender } from "@/lib/charts/downsample";

describe("largest-triangle-three-buckets", () => {
  const series = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: Math.sin(i / 20) * 10 + i * 0.01 }));

  it("returns the data unchanged when the threshold exceeds its length", () => {
    expect(largestTriangleThreeBuckets(series, 5000)).toBe(series);
  });

  it("reduces to approximately the requested number of points", () => {
    expect(largestTriangleThreeBuckets(series, 100)).toHaveLength(100);
  });

  it("always keeps the first and last points", () => {
    const result = largestTriangleThreeBuckets(series, 50);
    expect(result[0]).toEqual(series[0]);
    expect(result[result.length - 1]).toEqual(series[series.length - 1]);
  });

  it("preserves a lone extreme spike that naive decimation would drop", () => {
    // Put a crash at index 501 — an odd index that every-nth sampling with an
    // even stride would step straight over.
    const flat = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: 100 }));
    flat[501] = { x: 501, y: 5 };
    const result = largestTriangleThreeBuckets(flat, 100);
    expect(result.some((p) => p.y === 5)).toBe(true);
    // Confirm the naive alternative really would have missed it.
    const naive = flat.filter((_, i) => i % 10 === 0);
    expect(naive.some((p) => p.y === 5)).toBe(false);
  });

  it("keeps x values monotonically increasing", () => {
    const result = largestTriangleThreeBuckets(series, 120);
    for (let i = 1; i < result.length; i++) expect(result[i].x).toBeGreaterThan(result[i - 1].x);
  });

  it("handles very short inputs without throwing", () => {
    expect(largestTriangleThreeBuckets([{ x: 0, y: 1 }], 10)).toHaveLength(1);
    expect(largestTriangleThreeBuckets([], 10)).toHaveLength(0);
  });
});

describe("downsampleSeries", () => {
  it("preserves the original index on the x axis", () => {
    const values = Array.from({ length: 5000 }, (_, i) => Math.cos(i / 50));
    const result = downsampleSeries(values, 200);
    expect(result).toHaveLength(200);
    expect(result[0].index).toBe(0);
    expect(result[result.length - 1].index).toBe(4999);
  });

  it("leaves a short series untouched", () => {
    expect(downsampleSeries([1, 2, 3], 600)).toHaveLength(3);
  });
});

describe("downsampleAligned", () => {
  it("samples every series on the same indices", () => {
    const a = Array.from({ length: 3000 }, (_, i) => Math.sin(i / 10) * 50);
    const b = Array.from({ length: 3000 }, (_, i) => i * 0.1);
    const rows = downsampleAligned([{ key: "a", values: a }, { key: "b", values: b }], 150);
    expect(rows).toHaveLength(150);
    for (const row of rows) {
      const i = row.index as number;
      expect(row.a).toBe(a[i]);
      expect(row.b).toBe(b[i]);
    }
  });

  it("passes nulls through for series with leading gaps", () => {
    const withGap: (number | null)[] = [null, null, 3, 4, 5];
    const rows = downsampleAligned([{ key: "x", values: withGap }], 600);
    expect(rows[0].x).toBeNull();
    expect(rows[2].x).toBe(3);
  });

  it("returns an empty array for no series", () => {
    expect(downsampleAligned([], 100)).toEqual([]);
  });
});

describe("pathsToRender", () => {
  it("caps the number of drawn paths", () => {
    expect(pathsToRender(100000)).toBe(120);
    expect(pathsToRender(10)).toBe(10);
  });
});
