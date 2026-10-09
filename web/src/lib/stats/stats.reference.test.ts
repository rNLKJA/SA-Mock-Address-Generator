/**
 * The statistics checked against independent SciPy / statsmodels values
 * (scripts/make_stats_reference.py).
 */
import { describe, expect, it } from "vitest";
import ref from "./__fixtures__/reference.json";
import {
  chiSquareGoodnessOfFit,
  clarkEvans,
  cohensW,
  exactMultinomialTest,
  exactTestSizes,
  normalCdf,
  normalQuantile,
  sampleSizeExactShare,
  sampleSizeNormal,
  sampleSizeWilson,
  shareWithinMarginProbability,
  wilson,
  zeroEventUpperBound,
  zeroFailureSampleSize,
  zForConfidence,
  type XY,
} from "./index";

describe("normal distribution matches scipy.stats.norm", () => {
  for (const c of ref.normal.quantiles) {
    it(`ppf(${c.p})`, () => {
      expect(normalQuantile(c.p)).toBeCloseTo(c.z, 9);
    });
  }
  for (const c of ref.normal.cdf) {
    it(`cdf(${c.x})`, () => {
      expect(normalCdf(c.x)).toBeCloseTo(c.p, 12);
    });
  }
});

describe("exact multinomial test matches brute-force enumeration with scipy.stats.multinomial", () => {
  for (const c of ref.exactMultinomial) {
    it(`observed ${c.observed.join("/")}`, () => {
      const r = exactMultinomialTest(c.observed, c.probs, 1_000_000)!;
      expect(r).not.toBeNull();
      expect(r.pValue).toBeCloseTo(c.p, 10);
      expect(r.probObserved).toBeCloseTo(c.probObserved, 12);
      expect(r.outcomes).toBe(c.outcomes);
    });
  }
});

describe("true test sizes match full enumeration in NumPy/SciPy", () => {
  for (const c of ref.testSizes) {
    it(`n=${c.n}, ${c.probs.length} categories`, () => {
      const r = exactTestSizes(c.n, c.probs)!;
      expect(r.outcomes).toBe(c.outcomes);
      expect(r.exact).toBeCloseTo(c.exact, 10);
      expect(r.chiSquare).toBeCloseTo(c.chiSquare, 10);
      expect(r.disagree).toBeCloseTo(c.disagree, 10);
      // the exact test never exceeds its level
      expect(r.exact).toBeLessThanOrEqual(0.05);
    });
  }
});

describe("chi-square goodness of fit and Cohen's w match scipy.stats.chisquare", () => {
  for (const c of ref.chiSquare) {
    it(`observed ${c.observed.join("/")}`, () => {
      const r = chiSquareGoodnessOfFit(c.observed, c.probs)!;
      expect(r.statistic).toBeCloseTo(c.statistic, 9);
      expect(r.pValue).toBeCloseTo(c.p, 9);
      const n = c.observed.reduce((a, b) => a + b, 0);
      expect(cohensW(r.statistic, n)).toBeCloseTo(c.w, 12);
    });
  }
});

describe("sample sizes match a brute-force search in Python", () => {
  for (const c of ref.sampleSize) {
    it(`p=${c.p}, ±${c.margin} at ${c.confidence * 100}%`, () => {
      expect(sampleSizeNormal(c.p, c.margin, c.confidence)).toBe(c.normal);
      expect(sampleSizeWilson(c.p, c.margin, c.confidence)).toBe(c.wilson);
      expect(sampleSizeExactShare(c.p, c.margin, c.confidence)).toBe(c.exact);
    });
  }

  it("the exact size is the first n from which the binomial window stays above the confidence", () => {
    for (const c of ref.sampleSize) {
      expect(shareWithinMarginProbability(c.exact, c.p, c.margin)).toBeGreaterThanOrEqual(
        c.confidence,
      );
      expect(shareWithinMarginProbability(c.exact - 1, c.p, c.margin)).toBeLessThan(
        c.confidence,
      );
    }
  });

  it("statsmodels' Wilson interval at the planning size is about ±E wide", () => {
    ref.wilsonAtPlanningSize.forEach((c, i) => {
      const [lo, hi] = wilson(c.k, c.n, zForConfidence(c.confidence));
      expect(lo).toBeCloseTo(c.lo, 10);
      expect(hi).toBeCloseTo(c.hi, 10);
      // rounding k = n p to a whole number moves the half-width a little
      expect((hi - lo) / 2).toBeLessThan(ref.sampleSize[i].margin * 1.05);
    });
  });
});

describe("share window probabilities match scipy.stats.binom", () => {
  for (const c of ref.shareWindow) {
    it(`n=${c.n}, p=${c.p}, ±${c.margin}`, () => {
      expect(shareWithinMarginProbability(c.n, c.p, c.margin)).toBeCloseTo(c.prob, 10);
    });
  }
});

describe("zero-failure sample sizes match scipy.stats.beta (Clopper-Pearson)", () => {
  for (const c of ref.zeroFailure) {
    it(`rate < ${c.maxRate} at ${c.confidence * 100}%`, () => {
      expect(zeroFailureSampleSize(c.maxRate, c.confidence)).toBe(c.n);
      expect(zeroEventUpperBound(c.n, 1 - c.confidence)).toBeCloseTo(c.upper, 12);
    });
  }
});

describe("Clark-Evans ratio matches a k-d tree computation in SciPy", () => {
  for (const c of ref.clarkEvans) {
    it(c.name, () => {
      const r = clarkEvans(c.points as XY[], c.area, c.perimeter)!;
      expect(r.meanNn).toBeCloseTo(c.meanNn, 12);
      expect(r.expectedNaive).toBeCloseTo(c.expectedNaive, 12);
      expect(r.rNaive).toBeCloseTo(c.rNaive, 12);
      expect(r.expected).toBeCloseTo(c.expected, 12);
      expect(r.r).toBeCloseTo(c.r, 12);
      expect(r.z).toBeCloseTo(c.z, 10);
      expect(r.pValue).toBeCloseTo(c.p, 12);
    });
  }
});
