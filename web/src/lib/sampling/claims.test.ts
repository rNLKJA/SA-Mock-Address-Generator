/**
 * The numbers quoted in the README, the decision records and the data card,
 * recomputed with the same code, seeds and settings as /sampling. If a change
 * moves one of them, this test fails and the prose has to be updated too.
 */
import { describe, expect, it } from "vitest";
import { GeometryIndex } from "@/lib/geo";
import { polygonMetrics } from "@/lib/stats";
import { salGeojson, suburbsJson } from "@/lib/test-utils/data";
import { runDesignStudy, singleSample, smallSampleSizes } from "./design-study";
import { runUniformityStudy, validateCensus, validateGenerated } from "./spatial-checks";

const rows = suburbsJson.rows;
const index = new GeometryIndex(salGeojson);

describe("claims about the sampling designs (README, DR-002, DR-005)", () => {
  const study = runDesignStudy(rows, { n: 1000, replicates: 200, firstSeed: 1 });
  const byId = Object.fromEntries(study.designs.map((d) => [d.id, d]));

  it("seed 2025, n = 2,000: weighted χ²(4) = 2.86, p = 0.58; uniform χ²(4) = 497, w = 0.50", () => {
    const w = singleSample(rows, "weighted", 2000, 2025).fit;
    const u = singleSample(rows, "uniform", 2000, 2025).fit;
    expect(w.statistic.toFixed(2)).toBe("2.86");
    expect(w.pValue.toFixed(2)).toBe("0.58");
    expect(Math.round(u.statistic)).toBe(497);
    expect(u.pValue).toBeLessThan(0.001);
    expect(u.w.toFixed(2)).toBe("0.50");
  });

  it("weighted design: rejected in 6 of 200 seeds (1.4% to 6.4%), coverage 93.5% to 97%", () => {
    const r = byId.weighted.rejection;
    expect(r.k).toBe(6);
    expect((r.lo * 100).toFixed(1)).toBe("1.4");
    expect((r.hi * 100).toFixed(1)).toBe("6.4");
    const cov = byId.weighted.strata.map((s) => s.coverage.rate);
    expect(Math.min(...cov)).toBeCloseTo(0.935, 10);
    expect(Math.max(...cov)).toBeCloseTo(0.97, 10);
  });

  it("uniform design: rejected in all 200 seeds (w about 0.45); stratified: exact in all 200", () => {
    expect(byId.uniform.rejection.k).toBe(200);
    expect(byId.uniform.w.mean).toBeGreaterThan(0.44);
    expect(byId.uniform.w.mean).toBeLessThan(0.45);
    expect(byId.stratified.rejection.k).toBe(0);
    for (const s of byId.stratified.strata) expect(s.coverage.k).toBe(200);
  });

  it("exact false-alarm rates at n = 10, 20, 30 (DR-005)", () => {
    const [n10, n20, n30] = smallSampleSizes([10, 20, 30]);
    const pct = (v: number) => (v * 100).toFixed(2);
    expect([pct(n10.exact), pct(n10.chiSquare)]).toEqual(["4.89", "4.86"]);
    expect([pct(n20.exact), pct(n20.chiSquare)]).toEqual(["4.97", "5.28"]);
    expect([pct(n30.exact), pct(n30.chiSquare)]).toEqual(["4.96", "5.04"]);
    for (const s of [n10, n20, n30]) {
      expect(s.disagree).toBeGreaterThan(0.018);
      expect(s.disagree).toBeLessThan(0.025);
    }
  });
});

describe("claims about coordinates (DR-003, data card)", () => {
  it("5,000 of 5,000 for two designs and 8,475 of 8,475 in the census, no fallbacks", () => {
    const checks = [
      validateGenerated(rows, index, { count: 5000, seed: 2025, mode: "uniform" }),
      validateGenerated(rows, index, { count: 5000, seed: 2025, mode: "population" }),
      validateCensus(rows, index, { perSuburb: 5, seed: 2025 }),
    ];
    expect(checks.map((c) => [c.points, c.inside.k, c.fallbacks])).toEqual([
      [5000, 5000, 0],
      [5000, 5000, 0],
      [8475, 8475, 0],
    ]);
    expect((checks[0].inside.lo * 100).toFixed(2)).toBe("99.92");
    expect((checks[2].inside.lo * 100).toFixed(2)).toBe("99.95");
  });

  it("Clark-Evans: single-part suburbs at 1, Kingscote above, controls flagged", () => {
    const u = runUniformityStudy(rows, index, salGeojson, {
      pointsPerSuburb: 200,
      replicates: 100,
      headlineSeed: 2025,
      firstSeed: 1,
    });
    const single = u.suburbs.filter((x) => x.parts === 1);
    expect(single).toHaveLength(5);
    for (const s of single) {
      expect(s.rMean.estimate).toBeGreaterThan(0.99);
      expect(s.rMean.estimate).toBeLessThan(1.01);
      expect(s.rejection.k).toBeLessThanOrEqual(8);
    }
    // README: "averages 0.996 to 1.003 over 100 seeds in five single-part suburbs"
    const means = single.map((s) => s.rMean.estimate);
    expect(Math.min(...means).toFixed(3)).toBe("0.996");
    expect(Math.max(...means).toFixed(3)).toBe("1.003");
    const kingscote = u.suburbs.find((s) => s.name === "Kingscote")!;
    expect(kingscote.parts).toBe(2);
    expect(kingscote.rMean.estimate.toFixed(2)).toBe("1.02");
    expect(kingscote.rejection.k).toBe(13);
    const [geocoded, clustered] = u.controls.items;
    expect(geocoded.result.r).toBe(0);
    expect(clustered.result.r.toFixed(2)).toBe("0.34");
  });

  it("projected areas agree with the ABS to within about 1% for 90% of suburbs over 0.5 km²", () => {
    const byCode = new Map(rows.map((r) => [r.code, r]));
    const errors = salGeojson.features
      .map((f) => {
        const r = byCode.get(String(f.properties.c))!;
        return r.addressable && r.areaKm2 > 0.5
          ? Math.abs(polygonMetrics(f.geometry).areaKm2 / r.areaKm2 - 1)
          : null;
      })
      .filter((e): e is number => e !== null);
    const within = errors.filter((e) => e <= 0.011).length / errors.length;
    expect(within).toBeGreaterThanOrEqual(0.9);
  });
});

describe("claims about the table (data card)", () => {
  it("has 1,696 rows, 1,695 addressable, 83 without SEIFA and 1,777,698 residents", () => {
    expect(rows).toHaveLength(1696);
    expect(rows.filter((r) => r.addressable)).toHaveLength(1695);
    expect(rows.filter((r) => r.decileSa === null)).toHaveLength(83);
    expect(rows.reduce((s, r) => s + r.pop, 0)).toBe(1777698);
  });
});
