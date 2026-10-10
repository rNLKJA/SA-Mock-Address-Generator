import { describe, expect, it } from "vitest";
import ref from "@/lib/__fixtures__/stats-reference.json";
import { chiSquareGoodnessOfFit, chiSquareSf, logGamma, wilson } from "./index";

describe("chi-square survival function matches scipy.stats.chi2.sf", () => {
  for (const c of ref.chi2sf) {
    it(`x=${c.x}, df=${c.df}`, () => {
      expect(chiSquareSf(c.x, c.df)).toBeCloseTo(c.p, 10);
    });
  }
});

describe("goodness of fit matches scipy.stats.chisquare", () => {
  for (const c of ref.gof) {
    it(`observed ${c.observed.join("/")}`, () => {
      const r = chiSquareGoodnessOfFit(c.observed, c.probs)!;
      expect(r.statistic).toBeCloseTo(c.statistic, 9);
      expect(r.pValue).toBeCloseTo(c.p, 9);
      expect(r.df).toBe(c.df);
    });
  }

  it("drops zero-probability categories and flags small expected counts", () => {
    const r = chiSquareGoodnessOfFit([10, 0, 2], [0.8, 0, 0.2])!;
    expect(r.categories).toBe(2);
    expect(r.df).toBe(1);
    expect(r.lowExpected).toBe(1);
  });

  it("returns null when there is nothing to test", () => {
    expect(chiSquareGoodnessOfFit([0, 0], [0.5, 0.5])).toBeNull();
    expect(chiSquareGoodnessOfFit([5, 5], [1, 0])).toBeNull();
  });
});

describe("Wilson interval matches statsmodels proportion_confint(method='wilson')", () => {
  for (const c of ref.wilson95) {
    it(`${c.k}/${c.n}`, () => {
      const [lo, hi] = wilson(c.k, c.n);
      expect(lo).toBeCloseTo(c.lo, 10);
      expect(hi).toBeCloseTo(c.hi, 10);
    });
  }

  it("reaches exactly 0 at k = 0 and exactly 1 at k = n", () => {
    // Floating point used to give 0.9999999999999998 at 300 of 300.
    for (let n = 1; n <= 5000; n++) {
      expect(wilson(0, n)[0], `0/${n}`).toBe(0);
      expect(wilson(n, n)[1], `${n}/${n}`).toBe(1);
    }
  });
});

describe("logGamma", () => {
  it("matches known values", () => {
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
  });
});
