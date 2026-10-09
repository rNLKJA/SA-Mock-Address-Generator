import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import {
  FIT_METHOD_LABEL,
  Z95,
  bonferroniConfidence,
  bootstrapPercentileCI,
  clarkEvans,
  cohensWLabel,
  exactMultinomialTest,
  goodnessOfFit,
  logOutcomeCount,
  mean,
  monteCarloGoodnessOfFit,
  nearestNeighbourDistances,
  percentileRange,
  polygonMetrics,
  quantile,
  sampleSizeForShares,
  sampleSizePerStratum,
  sd,
  wilsonHalfWidth,
  zForConfidence,
  type XY,
} from "./index";

const CONFIG = [0.4, 0.25, 0.2, 0.1, 0.05];

describe("exact multinomial test", () => {
  it("gives p = 1 for the most likely vector and small p for a far one", () => {
    expect(exactMultinomialTest([8, 5, 4, 2, 1], CONFIG)!.pValue).toBeCloseTo(1, 12);
    expect(exactMultinomialTest([0, 0, 0, 0, 20], CONFIG)!.pValue).toBeLessThan(1e-10);
  });

  it("sums the probabilities of all outcomes to one", () => {
    // p-value with the least likely vector is that vector's own probability;
    // with the most likely, everything: so outcomes cover the whole space.
    const r = exactMultinomialTest([2, 1, 1], [0.5, 0.25, 0.25])!;
    expect(r.outcomes).toBe(15); // C(6, 2)
    expect(Math.exp(logOutcomeCount(4, 3))).toBeCloseTo(15, 9);
  });

  it("returns p = 0 when a zero-probability category is observed", () => {
    expect(exactMultinomialTest([3, 1], [1, 0])!.pValue).toBe(0);
  });

  it("refuses to enumerate beyond the limit", () => {
    expect(exactMultinomialTest([400, 250, 200, 100, 50], CONFIG)).toBeNull();
  });
});

describe("Monte Carlo goodness of fit", () => {
  it("is seeded and close to the exact p-value on a small case", () => {
    const a = monteCarloGoodnessOfFit([10, 6, 3, 1, 0], CONFIG, {
      replicates: 4000,
      seed: 7,
    })!;
    const b = monteCarloGoodnessOfFit([10, 6, 3, 1, 0], CONFIG, {
      replicates: 4000,
      seed: 7,
    })!;
    expect(a.pValue).toBe(b.pValue);
    // Pearson-ordered and probability-ordered p-values differ a little; both are large here.
    expect(a.pValue).toBeGreaterThan(0.6);
    const far = monteCarloGoodnessOfFit([0, 0, 0, 2, 18], CONFIG, { replicates: 999 })!;
    expect(far.pValue).toBeCloseTo(1 / 1000, 12);
  });
});

describe("goodnessOfFit picks a method and says which", () => {
  it("uses the exact test for small samples", () => {
    const r = goodnessOfFit([10, 6, 3, 1, 0], CONFIG)!;
    expect(r.method).toBe("exact");
    expect(r.n).toBe(20);
    expect(FIT_METHOD_LABEL[r.method]).toMatch(/exact/);
  });

  it("uses the asymptotic test when every expected count is at least 5", () => {
    const r = goodnessOfFit([800, 500, 400, 200, 100], CONFIG)!;
    expect(r.method).toBe("chi-square");
    expect(r.statistic).toBeCloseTo(0, 12);
    expect(r.w).toBeCloseTo(0, 12);
  });

  it("simulates when expected counts are small but the sample is too big to enumerate", () => {
    const probs = [...Array(10).fill(0.0995), 0.005];
    const obs = [...Array(10).fill(30), 0];
    const r = goodnessOfFit(obs, probs, { seed: 11 })!;
    expect(r.method).toBe("monte-carlo");
    expect(r.replicates).toBeGreaterThanOrEqual(500);
    expect(r.seed).toBe(11);
    expect(r.pValue).toBeGreaterThan(0);
    expect(r.pValue).toBeLessThanOrEqual(1);
  });

  it("labels Cohen's w", () => {
    expect(cohensWLabel(0.05)).toBe("negligible");
    expect(cohensWLabel(0.2)).toBe("small");
    expect(cohensWLabel(0.35)).toBe("medium");
    expect(cohensWLabel(0.8)).toBe("large");
  });
});

describe("sample-size planning", () => {
  it("finds the binding stratum for share precision", () => {
    const r = sampleSizeForShares(CONFIG, 0.02);
    expect(r.strata[0].share).toBeCloseTo(0.4, 12);
    // p = 0.4 is closest to 1/2, so it needs the most addresses
    expect(r.total).toBe(r.strata[0].wilson);
    expect(r.confidencePerStratum).toBe(0.95);
    const simultaneous = sampleSizeForShares(CONFIG, 0.02, 0.95, true);
    expect(simultaneous.confidencePerStratum).toBeCloseTo(0.99, 12);
    expect(simultaneous.total).toBeGreaterThan(r.total);
  });

  it("ignores strata with zero weight", () => {
    const r = sampleSizeForShares([1, 0, 1], 0.05);
    expect(r.strata[1]).toEqual({ share: 0, normal: 0, wilson: 0 });
  });

  it("sizes each stratum for a within-stratum rate", () => {
    const r = sampleSizePerStratum(5, 0.05);
    expect(r.perStratum).toBe(381);
    expect(r.total).toBe(5 * 381);
    expect(bonferroniConfidence(0.95, 5)).toBeCloseTo(0.99, 12);
  });

  it("Wilson half-width shrinks with n and z is right at 95%", () => {
    expect(wilsonHalfWidth(0.3, 100)).toBeGreaterThan(wilsonHalfWidth(0.3, 400));
    expect(zForConfidence(0.95)).toBe(Z95);
    expect(zForConfidence(0.99)).toBeCloseTo(2.5758293035489, 10);
  });
});

describe("descriptive statistics and the bootstrap", () => {
  it("computes quantiles like NumPy's default", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(percentileRange([1, 2, 3, 4, 5], 0.5)).toEqual([2, 4]);
    expect(mean([1, 2, 3])).toBe(2);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138089935, 9);
  });

  it("gives a seeded interval around the mean, close to the normal-theory one", () => {
    const values = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 3 + 10);
    const a = bootstrapPercentileCI(values, { seed: 3, replicates: 4000 });
    const b = bootstrapPercentileCI(values, { seed: 3, replicates: 4000 });
    expect(a).toEqual(b);
    expect(a.lo).toBeLessThan(a.estimate);
    expect(a.hi).toBeGreaterThan(a.estimate);
    const se = sd(values) / Math.sqrt(values.length);
    expect(a.hi - a.lo).toBeGreaterThan(2 * 1.96 * se * 0.85);
    expect(a.hi - a.lo).toBeLessThan(2 * 1.96 * se * 1.15);
  });
});

describe("spatial statistics", () => {
  it("measures a 1° x 1° box near Adelaide sensibly", () => {
    const box: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [138, -35],
          [139, -35],
          [139, -34],
          [138, -34],
          [138, -35],
        ],
      ],
    };
    const m = polygonMetrics(box);
    // 111.195 km x (111.195 cos 34.5°) km
    expect(m.areaKm2).toBeCloseTo(
      111.19508 * 111.19508 * Math.cos((34.5 * Math.PI) / 180),
      0,
    );
    expect(m.parts).toBe(1);
    expect(m.holes).toBe(0);
    expect(m.compactness).toBeGreaterThan(0.75);
    expect(m.compactness).toBeLessThan(Math.PI / 4 + 0.01);
  });

  it("subtracts holes from the area", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.02, 0],
          [0.02, 0.02],
          [0, 0.02],
          [0, 0],
        ],
        [
          [0.005, 0.005],
          [0.015, 0.005],
          [0.015, 0.015],
          [0.005, 0.015],
          [0.005, 0.005],
        ],
      ],
    };
    const m = polygonMetrics(withHole);
    const side = 0.02 * 111.19508;
    expect(m.areaKm2).toBeCloseTo(side * side * 0.75, 4);
    expect(m.holes).toBe(1);
  });

  it("gives a Clark-Evans ratio of 2 for a square lattice (without edge correction)", () => {
    const pts: XY[] = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) pts.push([i, j]);
    const nn = nearestNeighbourDistances(pts);
    expect(Array.from(nn).every((d) => Math.abs(d - 1) < 1e-12)).toBe(true);
    const r = clarkEvans(pts, 400, 80)!;
    expect(r.rNaive).toBeCloseTo(2, 12);
    expect(r.r).toBeLessThan(r.rNaive);
  });

  it("matches brute force nearest neighbours on random points", () => {
    let s = 1;
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const pts: XY[] = Array.from({ length: 300 }, () => [rand() * 7, rand() * 2]);
    const fast = nearestNeighbourDistances(pts);
    pts.forEach((p, i) => {
      let best = Infinity;
      pts.forEach((q, j) => {
        if (i !== j) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
      });
      expect(fast[i]).toBeCloseTo(best, 12);
    });
  });

  it("gives R = 0 when every point sits on the same spot (the 2025 geocode)", () => {
    const pts: XY[] = Array.from({ length: 50 }, () => [1, 1]);
    const r = clarkEvans(pts, 4, 8)!;
    expect(r.r).toBe(0);
    expect(r.pValue).toBeLessThan(1e-10);
  });
});
