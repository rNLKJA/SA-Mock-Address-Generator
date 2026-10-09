/**
 * Sample sizes for a target precision.
 *
 * Two planning questions come up when generating test data by stratum:
 *  1. How many addresses so that each stratum's realised share lands within
 *     ±E of its target (a multinomial share, so the interval is for p_h)?
 *  2. How many addresses per stratum to estimate something about the system
 *     under test (say, the share of addresses a parser rejects) within ±E in
 *     every stratum?
 * The first is a statement about where a share with a KNOWN target lands, so
 * it is answered with the exact binomial distribution of the realised share.
 * The second is about estimating an UNKNOWN rate, so it is answered with the
 * Wilson interval the rest of the lab reports. The normal approximation,
 * n = z² p(1 - p) / E², is given alongside both for comparison.
 */
import { wilsonHalfWidth, zeroEventUpperBound } from "./proportions";
import { logGamma, zForConfidence } from "./distributions";

/** n = ceil(z² p (1 - p) / E²), at least 1. */
export function sampleSizeNormal(p: number, margin: number, confidence = 0.95): number {
  if (!(margin > 0)) return Number.NaN;
  const z = zForConfidence(confidence);
  const n = (z * z * p * (1 - p)) / (margin * margin);
  // Guard against 2304.0000000001 rounding up to 2305.
  return Math.max(1, Math.ceil(n - 1e-9));
}

/**
 * Smallest n whose Wilson interval, at an observed share equal to the planning
 * value p, has a half-width of at most `margin`. The half-width falls as n
 * grows, so a doubling search then bisection finds it exactly.
 */
export function sampleSizeWilson(p: number, margin: number, confidence = 0.95): number {
  if (!(margin > 0) || margin >= 0.5) return margin >= 0.5 ? 1 : Number.NaN;
  const z = zForConfidence(confidence);
  if (wilsonHalfWidth(p, 1, z) <= margin) return 1;
  let hi = 2;
  while (wilsonHalfWidth(p, hi, z) > margin) {
    hi *= 2;
    if (hi > 1e9) return Number.NaN;
  }
  let lo = hi / 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (wilsonHalfWidth(p, mid, z) <= margin) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * P(|K/n - p| <= margin) for K ~ Binomial(n, p): the probability that the
 * realised share of a stratum with target share p lands within ±margin of it.
 * Sums the binomial pmf over the window, starting from the mode and stepping
 * outwards with the pmf ratio, so a call costs about 2·n·margin steps.
 */
export function shareWithinMarginProbability(
  n: number,
  p: number,
  margin: number,
): number {
  if (n <= 0 || p <= 0 || p >= 1) return 1;
  // Tolerance so that an exact boundary such as 2,300 × 0.42 = 966 counts as
  // inside despite floating point.
  const lo = Math.max(0, Math.ceil(n * (p - margin) - 1e-7));
  const hi = Math.min(n, Math.floor(n * (p + margin) + 1e-7));
  if (lo > hi) return 0;
  const start = Math.min(hi, Math.max(lo, Math.floor((n + 1) * p)));
  const logPmf =
    logGamma(n + 1) -
    logGamma(start + 1) -
    logGamma(n - start + 1) +
    start * Math.log(p) +
    (n - start) * Math.log1p(-p);
  const odds = p / (1 - p);
  const base = Math.exp(logPmf);
  let sum = base;
  let t = base;
  for (let k = start; k < hi; k++) {
    t *= ((n - k) / (k + 1)) * odds;
    sum += t;
  }
  t = base;
  for (let k = start; k > lo; k--) {
    t *= k / (n - k + 1) / odds;
    sum += t;
  }
  return Math.min(1, sum);
}

/** Kullback-Leibler divergence KL(Bernoulli(a) || Bernoulli(p)). */
function bernoulliKl(a: number, p: number): number {
  const term = (x: number, y: number) => (x === 0 ? 0 : x * Math.log(x / y));
  return term(a, p) + term(1 - a, 1 - p);
}

/**
 * Smallest n such that, for that n and every larger n, the realised share of a
 * stratum with target share p is within ±margin with probability at least
 * `confidence` (exact binomial). The probability is not monotone in n (the
 * window holds a whole number of addresses), hence "and every larger n".
 *
 * The Chernoff bound P(|K/n - p| > E) <= e^{-n KL(p+E||p)} + e^{-n KL(p-E||p)}
 * gives an n beyond which the probability is guaranteed; the search walks down
 * from there to the last n that falls short. Returns NaN if that bound exceeds
 * `maxN` (very small margins, where the normal approximation is close).
 */
export function sampleSizeExactShare(
  p: number,
  margin: number,
  confidence = 0.95,
  maxN = 100_000,
): number {
  if (!(margin > 0)) return Number.NaN;
  if (p <= 0 || p >= 1) return 1;
  const kl: number[] = [];
  if (p + margin <= 1) kl.push(bernoulliKl(p + margin, p));
  if (p - margin >= 0) kl.push(bernoulliKl(p - margin, p));
  if (kl.length === 0) return 1;
  const bound = Math.ceil(Math.log(kl.length / (1 - confidence)) / Math.min(...kl));
  if (!(bound <= maxN)) return Number.NaN;
  for (let n = bound; n >= 1; n--) {
    if (shareWithinMarginProbability(n, p, margin) < confidence) return n + 1;
  }
  return 1;
}

/** Confidence per stratum so that all m intervals hold together (Bonferroni). */
export function bonferroniConfidence(confidence: number, m: number): number {
  return 1 - (1 - confidence) / Math.max(1, m);
}

export interface ShareSampleSize {
  /** Target share of each stratum (normalised). */
  share: number;
  /** Total addresses needed for this stratum's share to be within ±E. */
  normal: number;
  /** Exact binomial answer (NaN when the margin is too small to search). */
  exact: number;
}

/**
 * Question 1: total sample size so each stratum's realised share is within
 * ±margin of its target, from the exact binomial distribution of each share
 * (sampleSizeExactShare). The binding stratum is the one with p closest to
 * 1/2; the answer is the largest of the per-stratum sizes. `exact` is false
 * when some stratum fell back to the normal approximation.
 */
export function sampleSizeForShares(
  targets: readonly number[],
  margin: number,
  confidence = 0.95,
  simultaneous = false,
): {
  strata: ShareSampleSize[];
  total: number;
  exact: boolean;
  confidencePerStratum: number;
} {
  const sum = targets.reduce((a, b) => a + Math.max(0, b), 0);
  const live = targets.filter((t) => t > 0).length;
  const conf = simultaneous ? bonferroniConfidence(confidence, live) : confidence;
  const strata = targets.map((t) => {
    const share = sum > 0 ? Math.max(0, t) / sum : 0;
    if (share <= 0) return { share, normal: 0, exact: 0 };
    return {
      share,
      normal: sampleSizeNormal(share, margin, conf),
      exact: sampleSizeExactShare(share, margin, conf),
    };
  });
  const exact = strata.every((s) => Number.isFinite(s.exact));
  return {
    strata,
    total: Math.max(
      0,
      ...strata.map((s) => (Number.isFinite(s.exact) ? s.exact : s.normal)),
    ),
    exact,
    confidencePerStratum: conf,
  };
}

/**
 * Question 2: addresses per stratum to estimate a within-stratum proportion
 * (planning value p, 0.5 is the worst case) within ±margin. With a stratified
 * design the generator can deliver exactly this many per stratum.
 */
export function sampleSizePerStratum(
  strata: number,
  margin: number,
  confidence = 0.95,
  planning = 0.5,
  simultaneous = false,
): { perStratum: number; total: number; confidencePerStratum: number } {
  const conf = simultaneous ? bonferroniConfidence(confidence, strata) : confidence;
  const perStratum = sampleSizeWilson(planning, margin, conf);
  return { perStratum, total: perStratum * strata, confidencePerStratum: conf };
}

/**
 * Zero-failure demonstration: the smallest n such that seeing no failures
 * bounds the failure rate below `maxRate` with the given confidence
 * (one-sided Clopper-Pearson: (1 - maxRate)^n <= 1 - confidence).
 */
export function zeroFailureSampleSize(maxRate: number, confidence = 0.95): number {
  if (!(maxRate > 0 && maxRate < 1)) return Number.NaN;
  const n = Math.ceil(Math.log(1 - confidence) / Math.log(1 - maxRate) - 1e-9);
  // Floating point can leave the bound a hair above maxRate at the boundary.
  return zeroEventUpperBound(n, 1 - confidence) <= maxRate ? n : n + 1;
}
