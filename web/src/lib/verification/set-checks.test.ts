import { describe, expect, it } from "vitest";
import { generateMockAddresses, type MockAddress } from "@/lib/generator/generate";
import { chiSquareSf, wilson } from "@/lib/stats";
import { RA_NAMES } from "@/lib/suburbs";
import {
  asSuburb,
  byCode,
  byName,
  generated,
  index,
  options,
  rows,
} from "@/lib/test-utils/verification";
import {
  checkDistribution,
  checkReproducibility,
  checkSpatialSpread,
  observedCounts,
  reproducibilityNotRun,
  spatialReplicates,
  sha256Hex,
} from "./set-checks";

const design = (overrides = {}) =>
  generateMockAddresses(rows, null, options({ ...overrides, coordinates: false }));

describe("observed class counts", () => {
  it("count remoteness and deciles from the rows, with a no-SEIFA bucket", () => {
    const set = generated({ count: 300 });
    const c = observedCounts(set);
    expect(c.remoteness.reduce((a, b) => a + b, 0)).toBe(300);
    expect(c.decile.reduce((a, b) => a + b, 0)).toBe(300);
    expect(c.unrecognised).toEqual({ remoteness: 0, decile: 0 });
    // the generator's own tally agrees
    const r = generateMockAddresses(rows, index, options({ count: 300 }));
    expect(c.remoteness).toEqual(r.observed.remoteness);
    expect(c.decile).toEqual(r.observed.decile);
  });

  it("set aside classes the generator cannot produce", () => {
    const set = generated({ count: 20 }).map((a, i) =>
      i === 0 ? { ...a, remoteness_level: "Nowhere", seifa_decile_sa: 11 } : a,
    );
    expect(observedCounts(set).unrecognised).toEqual({ remoteness: 1, decile: 1 });
  });
});

describe("distribution against the design's targets", () => {
  it("reports chi-square, df, p, Cohen's w and Wilson intervals that match a hand computation", () => {
    // 12 and 8 of 20 against a 50/50 target: chi2 = (2^2 + 2^2) / 10 = 0.8 on 1 df.
    const c = checkDistribution("remoteness", [12, 8, 0, 0, 0], [0.5, 0.5, 0, 0, 0]);
    const t = c.details!.test!;
    expect(t.chiSquare).toBeCloseTo(0.8, 12);
    expect(t.df).toBe(1);
    expect(t.chiSquareP).toBeCloseTo(chiSquareSf(0.8, 1), 12);
    expect(t.cohensW).toBeCloseTo(Math.sqrt(0.8 / 20), 12);
    expect(t.method).toBe("exact");
    expect(c.details!.rows).toHaveLength(2);
    const [lo, hi] = wilson(12, 20);
    expect(c.details!.rows[0]).toMatchObject({
      label: "Major Cities",
      k: 12,
      share: 0.6,
      lo,
      hi,
      target: 0.5,
      targetInside: true,
    });
    expect(c.status).toBe("pass");
    expect(c.summary).toContain("χ²(1) = 0.80");
    expect(c.summary).toContain("Cohen's w = 0.200");
    expect(c.summary).toContain("weak evidence");
  });

  it("passes a set from the site's generator in every random design", () => {
    // A test at α = 0.05 rejects about 1 honest set in 20, so this fixes one
    // seed (2025, the site's default) and the calibration test below checks
    // the rate across many.
    for (const mode of ["uniform", "remoteness", "seifa", "population"] as const) {
      const set = generated({ mode, count: 1000, seed: 2025 });
      const d = design({ mode, count: 1000 });
      const counts = observedCounts(set);
      const ra = checkDistribution(
        "remoteness",
        counts.remoteness,
        d.expected.remoteness,
      );
      const dec = checkDistribution("decile", counts.decile, d.expected.decile);
      expect(ra.status, `${mode} remoteness: ${ra.summary}`).toBe("pass");
      expect(dec.status, `${mode} decile: ${dec.summary}`).toBe("pass");
      expect(ra.details!.test!.df).toBe(4);
      expect(dec.details!.test!.df).toBe(mode === "seifa" ? 9 : 10);
    }
  });

  it("rejects about 5% of honest sets (calibration over 200 seeds)", () => {
    const expected = design({ count: 200 }).expected;
    let rejected = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = generateMockAddresses(
        rows,
        null,
        options({ count: 200, seed, coordinates: false }),
      );
      const counts = observedCounts(r.addresses);
      if (
        checkDistribution("remoteness", counts.remoteness, expected.remoteness).status ===
        "fail"
      )
        rejected++;
    }
    // Binomial(200, 0.05) has mean 10: outside 2 to 20 happens less than 0.5% of the time.
    expect(rejected).toBeGreaterThanOrEqual(2);
    expect(rejected).toBeLessThanOrEqual(20);
  }, 30_000);

  it("fails a deliberately skewed set: every address moved to Major Cities", () => {
    const majors = rows.filter((r) => r.addressable && r.ra === 0);
    const skewed = generated({ count: 300 }).map((a, i) =>
      asSuburb(a, majors[i % majors.length]),
    );
    const counts = observedCounts(skewed);
    expect(counts.remoteness).toEqual([300, 0, 0, 0, 0]);
    const c = checkDistribution(
      "remoteness",
      counts.remoteness,
      design().expected.remoteness,
    );
    expect(c.status).toBe("fail");
    expect(c.details!.test!.pValue).toBeLessThan(0.001);
    expect(c.details!.test!.cohensW).toBeGreaterThan(0.5);
    expect(c.details!.rows.filter((r) => !r.targetInside)).toHaveLength(5);
    expect(c.summary).toContain("departs from the design's targets");
  });

  it("fails a subtler skew that a large sample can detect", () => {
    // Uniform by suburb, but a quarter of the Very Remote rows swapped for Major Cities.
    const majors = rows.filter((r) => r.addressable && r.ra === 0);
    let k = 0;
    const set = generated({ count: 3000, seed: 5 }).map((a) =>
      a.remoteness_level === RA_NAMES[4] && k++ % 4 === 0 ? asSuburb(a, majors[k]) : a,
    );
    const counts = observedCounts(set);
    const c = checkDistribution(
      "remoteness",
      counts.remoteness,
      design({ count: 3000 }).expected.remoteness,
    );
    expect(c.status).toBe("fail");
    expect(c.details!.test!.method).toBe("chi-square");
  });

  it("fails a set with addresses in classes the design gives zero weight", () => {
    const c = checkDistribution("remoteness", [10, 5, 1, 0, 0], [0.5, 0.5, 0, 0, 0]);
    expect(c.status).toBe("fail");
    expect(c.details!.impossible).toBe(1);
    expect(c.details!.test!.pValue).toBe(0);
    const u = checkDistribution("remoteness", [10, 5, 0, 0, 0], [0.5, 0.5, 0, 0, 0], {
      unrecognised: 2,
    });
    expect(u.status).toBe("fail");
    expect(u.details!.impossible).toBe(2);
    expect(u.details!.n).toBe(17);
  });

  it("does not test fewer than 10 addresses or a single class", () => {
    const small = checkDistribution("remoteness", [5, 4, 0, 0, 0], [0.5, 0.5, 0, 0, 0]);
    expect(small.status).toBe("not-run");
    expect(small.details!.test).toBeNull();
    expect(small.details!.rows).toHaveLength(2);
    const one = checkDistribution("remoteness", [40, 0, 0, 0, 0], [1, 0, 0, 0, 0]);
    expect(one.status).toBe("not-run");
    expect(one.summary).toContain("Only one class");
  });

  it("holds a stratified sample to its quotas exactly", () => {
    const opts = { mode: "stratified" as const, count: 20 };
    const r = generateMockAddresses(rows, index, options(opts));
    const counts = observedCounts(r.addresses);
    expect(counts.remoteness).toEqual(r.quotas);
    const ok = checkDistribution("remoteness", counts.remoteness, r.expected.remoteness, {
      quotas: r.quotas,
    });
    expect(ok.status).toBe("pass");
    expect(ok.details!.quotas).toEqual(r.quotas);
    expect(ok.details!.test!.chiSquare).toBeCloseTo(0, 12);
    const off = [...counts.remoteness];
    off[0]++;
    off[4]--;
    const bad = checkDistribution("remoteness", off, r.expected.remoteness, {
      quotas: r.quotas,
    });
    expect(bad.status).toBe("fail");
    expect(bad.summary).toContain("fixes the counts");
  });
});

/** A set whose points are all moved to `at(a)`. */
const movePoints = (
  set: MockAddress[],
  at: (a: MockAddress, i: number) => [number, number],
) =>
  set.map((a, i) => {
    const [lon, lat] = at(a, i);
    return { ...a, longitude: lon, latitude: lat };
  });

describe("spatial spread", () => {
  it("passes points from the site's generator, with the classic Clark-Evans ratio for one suburb", () => {
    const set = generated({ count: 60, filters: { suburb: "ADELAIDE" } });
    const c = checkSpatialSpread(set, index, byCode);
    expect(c.status, c.summary).toBe("pass");
    const d = c.details!;
    expect(d.points).toBe(60);
    expect(d.suburbs).toBe(1);
    expect(d.replicates).toBe(199);
    expect(d.ratio).toBeGreaterThan(0.8);
    expect(d.ratio).toBeLessThan(1.2);
    expect(d.simLo).toBeLessThan(d.expectedNnKm);
    expect(d.simHi).toBeGreaterThan(d.expectedNnKm);
    expect(d.clarkEvans?.suburb).toBe("ADELAIDE");
    expect(d.clarkEvans?.n).toBe(60);
    expect(c.summary).toContain("Classic Clark-Evans for ADELAIDE");
    expect(c.limitation).toContain("Donnelly");
    expect(c.limitation).toContain("not every departure from uniform");
  });

  it("passes a statewide set, where no suburb has enough points for the classic ratio", () => {
    const c = checkSpatialSpread(generated({ count: 25 }), index, byCode);
    expect(c.status, c.summary).toBe("pass");
    expect(c.details!.clarkEvans).toBeNull();
    expect(c.details!.suburbs).toBe(25);
  });

  it("fails the 2025 approach: every address in a suburb on one geocoded point", () => {
    // Holdfast Bay has a handful of suburbs, so each gets several addresses.
    const set = generated({ count: 100, filters: { council: "Holdfast Bay" }, seed: 9 });
    const at = movePoints(set, (a) => byCode.get(a.sal_code)!.label);
    const c = checkSpatialSpread(at, index, byCode);
    expect(c.status).toBe("fail");
    expect(c.details!.ratio).toBeLessThan(0.7);
    expect(c.summary).toContain("more clustered");
  });

  it("fails a clustered set: points within about 100 m of the suburb's label point", () => {
    const set = generated({ count: 60, filters: { suburb: "ADELAIDE" }, seed: 4 });
    const centre = byName.get("ADELAIDE")!.label;
    const clustered = movePoints(set, (_, i) => [
      centre[0] + ((i % 8) - 4) * 0.0002,
      centre[1] + (Math.floor(i / 8) - 4) * 0.0002,
    ]);
    const c = checkSpatialSpread(clustered, index, byCode);
    expect(c.status).toBe("fail");
    expect(c.details!.clarkEvans!.r).toBeLessThan(1);
    expect(c.details!.pValue).toBeLessThan(0.05);
  });

  it("rejects about 5% of honest sets (calibration over 40 seeds)", () => {
    let rejected = 0;
    for (let seed = 100; seed < 140; seed++) {
      const set = generated({ count: 40, filters: { suburb: "GLENELG" }, seed });
      if (checkSpatialSpread(set, index, byCode, { replicates: 99 }).status === "fail")
        rejected++;
    }
    // Binomial(40, 0.05): 6 or more happens less than 2% of the time.
    expect(rejected).toBeLessThanOrEqual(5);
  }, 30_000);

  it("is not run without coordinates", () => {
    const c = checkSpatialSpread(
      generated({ coordinates: false, count: 30 }),
      index,
      byCode,
    );
    expect(c.status).toBe("not-run");
    expect(c.details).toBeNull();
    expect(c.summary).toContain("no coordinates");
  });

  it("is reproducible: same set, same seed, same p-value", () => {
    const set = generated({ count: 120, seed: 8 });
    const a = checkSpatialSpread(set, index, byCode);
    const b = checkSpatialSpread(set, index, byCode);
    expect(a.details).toEqual(b.details);
  });

  it("uses fewer re-draws for big sets", () => {
    expect(spatialReplicates(500)).toBe(199);
    expect(spatialReplicates(2000)).toBe(99);
    expect(spatialReplicates(5000)).toBe(59);
  });
});

describe("reproducibility", () => {
  it("hashes with SHA-256", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("passes identical bytes", async () => {
    const c = await checkReproducibility("a,b\r\n1,2\r\n", "a,b\r\n1,2\r\n", {
      compared: "regenerated-twice",
      seed: 1,
      count: 1,
    });
    expect(c.status).toBe("pass");
    expect(c.details!.identical).toBe(true);
    expect(c.details!.sha256A).toBe(c.details!.sha256B);
    expect(c.details!.bytesA).toBe(10);
    expect(c.summary).toContain("byte-identical");
  });

  it("fails a single changed byte and points at the line", async () => {
    const a = "h\r\n1,ADELAIDE\r\n2,GLENELG\r\n";
    const b = "h\r\n1,ADELAIDE\r\n2,GLENELH\r\n";
    const c = await checkReproducibility(a, b, {
      compared: "input-vs-regenerated",
      seed: 1,
      count: 2,
    });
    expect(c.status).toBe("fail");
    expect(c.details!.bytesA).toBe(c.details!.bytesB);
    expect(c.details!.sha256A).not.toBe(c.details!.sha256B);
    expect(c.details!.firstDifference).toEqual({
      line: 3,
      a: "2,GLENELG",
      b: "2,GLENELH",
    });
  });

  it("fails different line endings: byte for byte means byte for byte", async () => {
    const c = await checkReproducibility("a\n", "a\r\n", {
      compared: "input-vs-regenerated",
      seed: 1,
      count: 1,
    });
    expect(c.status).toBe("fail");
  });

  it("says why it was not run", () => {
    const c = reproducibilityNotRun("No seed.");
    expect(c.status).toBe("not-run");
    expect(c.summary).toBe("No seed.");
  });
});
