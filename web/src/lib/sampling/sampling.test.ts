import { describe, expect, it } from "vitest";
import { GeometryIndex, pointInGeometry } from "@/lib/geo";
import { roundPoint } from "@/lib/generator/generate";
import { PythonRandom } from "@/lib/rng/python-random";
import { salGeojson, suburbsJson } from "@/lib/test-utils/data";
import { runDesignStudy, singleSample, smallSampleSizes } from "./design-study";
import { runUniformityStudy, validateCensus, validateGenerated } from "./spatial-checks";

const rows = suburbsJson.rows;
const index = new GeometryIndex(salGeojson);

describe("design study (small version)", () => {
  const study = runDesignStudy(rows, { n: 400, replicates: 30 });
  const byId = Object.fromEntries(study.designs.map((d) => [d.id, d]));

  it("draws the weighted design from the target, with multinomial spread", () => {
    for (const s of byId.weighted.strata) {
      expect(s.designShare).toBeCloseTo(s.target, 12);
      expect(Math.abs(s.meanShare - s.target)).toBeLessThan(
        4 * (s.theorySd / Math.sqrt(30)),
      );
      expect(s.sd).toBeGreaterThan(0.5 * s.theorySd);
      expect(s.sd).toBeLessThan(1.6 * s.theorySd);
    }
  });

  it("fixes the stratified shares exactly and reports them as fixed, not tested", () => {
    for (const s of byId.stratified.strata) {
      expect(s.sd).toBeLessThan(1e-12);
      expect(s.meanShare).toBeCloseTo(s.target, 12);
      expect(s.theorySd).toBe(0);
      expect(s.coverage).toBeNull();
    }
    expect(byId.stratified.fixedByDesign).toBe(true);
    expect(byId.stratified.rejection).toBeNull();
    expect(byId.stratified.seedsOnTarget).toBe(30);
  });

  it("tests the random designs and gives them coverage intervals", () => {
    for (const d of [byId.uniform, byId.weighted]) {
      expect(d.fixedByDesign).toBe(false);
      expect(d.rejection?.n).toBe(30);
      for (const s of d.strata) expect(s.coverage?.n).toBe(30);
    }
  });

  it("rejects the uniform design against the README target every time", () => {
    expect(byId.uniform.rejection?.k).toBe(30);
    expect(byId.uniform.w.mean).toBeGreaterThan(0.3);
  });

  it("reproduces the README's key result for seed 2025", () => {
    const uniform = singleSample(rows, "uniform", 2000, 2025);
    const weighted = singleSample(rows, "weighted", 2000, 2025);
    expect(uniform.fit.statistic).toBeCloseTo(497.45, 1);
    expect(weighted.fit.statistic).toBeCloseTo(2.86, 2);
    expect(weighted.fit.pValue).toBeCloseTo(0.58, 2);
    expect(weighted.rows.reduce((s, r) => s + r.k, 0)).toBe(2000);
  });

  it("computes the exact false-alarm rates of both tests at small n", () => {
    const sizes = smallSampleSizes([10, 20]);
    expect(sizes.map((s) => s.outcomes)).toEqual([1001, 10626]);
    for (const s of sizes) expect(s.exact).toBeLessThanOrEqual(0.05);
  });
});

describe("point-in-polygon validation", () => {
  it("puts every generated point inside its own suburb", () => {
    const v = validateGenerated(rows, index, { count: 3000, seed: 2025 });
    expect(v.inside.k).toBe(v.points);
    expect(v.failures).toEqual([]);
  });

  it("holds for a census of every suburb", () => {
    const v = validateCensus(rows, index, { perSuburb: 2, seed: 9 });
    expect(v.points).toBe(2 * rows.filter((r) => r.addressable).length);
    expect(v.inside.k).toBe(v.points);
    // all 3,390 inside: the Wilson lower bound is n / (n + z²)
    expect(v.inside.lo).toBeCloseTo(v.points / (v.points + 1.959963984540054 ** 2), 12);
  });

  it("guards against rounding a point across a boundary", () => {
    // Found by the validation: a point sampled inside Mobilong (40896) and
    // rounded to 6 decimals afterwards landed in the neighbouring suburb.
    const mobilong = salGeojson.features.find((f) => String(f.properties.c) === "40896")!;
    const rounded: [number, number] = [139.275399, -35.091769];
    expect(pointInGeometry(rounded, mobilong.geometry)).toBe(false);
    expect(index.locate(rounded)).toBe("40989");
    // the sampler now tests the rounded point, so it can only return inside points
    const rng = new PythonRandom(1);
    for (let i = 0; i < 300; i++) {
      const p = index.samplePoint("40896", rng, 2000, roundPoint)!;
      expect(p).toEqual(roundPoint(p));
      expect(index.locate(p)).toBe("40896");
    }
  });
});

describe("uniformity within suburbs (Clark-Evans)", () => {
  const u = runUniformityStudy(rows, index, salGeojson, {
    names: ["GLENELG", "MOUNT GAMBIER"],
    pointsPerSuburb: 150,
    replicates: 20,
  });

  it("gives R close to 1 for the generator's points", () => {
    for (const s of u.suburbs) {
      expect(s.rMean.estimate).toBeGreaterThan(0.95);
      expect(s.rMean.estimate).toBeLessThan(1.05);
      expect(s.rMean.lo).toBeLessThan(s.rMean.hi);
      expect(s.example.n).toBe(150);
      // projected area agrees with the ABS figure to within 3%
      const abs = rows.find((r) => r.code === s.code)!.areaKm2;
      expect(Math.abs(s.areaKm2 / abs - 1)).toBeLessThan(0.03);
    }
  });

  it("flags both negative controls as clustered", () => {
    const [geocoded, clustered] = u.controls.items;
    expect(geocoded.result.r).toBe(0);
    expect(clustered.result.r).toBeLessThan(0.6);
    expect(clustered.result.z).toBeLessThan(-5);
    expect(clustered.result.n).toBe(150);
  });
});
