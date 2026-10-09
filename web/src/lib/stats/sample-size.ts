/**
 * Sample sizes for a target precision.
 *
 * Two planning questions come up when generating test data by stratum:
 *  1. How many addresses so that each stratum's realised share lands within
 *     ±E of its target (a multinomial share, so the interval is for p_h)?
 *  2. How many addresses per stratum to estimate something about the system
 *     under test (say, the share of addresses a parser rejects) within ±E in
 *     every stratum?
 * Both reduce to the precision of a proportion. The normal approximation
 * gives n = z² p(1 - p) / E²; because the lab reports Wilson intervals, the
 * calculator also finds the smallest n whose Wilson half-width is at most E.
 */
import { wilsonHalfWidth, zeroEventUpperBound } from "./proportions";
import { zForConfidence } from "./distributions";

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

/** Confidence per stratum so that all m intervals hold together (Bonferroni). */
export function bonferroniConfidence(confidence: number, m: number): number {
  return 1 - (1 - confidence) / Math.max(1, m);
}

export interface ShareSampleSize {
  /** Target share of each stratum (normalised). */
  share: number;
  /** Total addresses needed for this stratum's share to be within ±E. */
  normal: number;
  wilson: number;
}

/**
 * Question 1: total sample size so each stratum's realised share is within
 * ±margin of its target. The binding stratum is the one with p closest to 1/2;
 * the answer is the largest of the per-stratum sizes.
 */
export function sampleSizeForShares(
  targets: readonly number[],
  margin: number,
  confidence = 0.95,
  simultaneous = false,
): { strata: ShareSampleSize[]; total: number; confidencePerStratum: number } {
  const sum = targets.reduce((a, b) => a + Math.max(0, b), 0);
  const live = targets.filter((t) => t > 0).length;
  const conf = simultaneous ? bonferroniConfidence(confidence, live) : confidence;
  const strata = targets.map((t) => {
    const share = sum > 0 ? Math.max(0, t) / sum : 0;
    if (share <= 0) return { share, normal: 0, wilson: 0 };
    return {
      share,
      normal: sampleSizeNormal(share, margin, conf),
      wilson: sampleSizeWilson(share, margin, conf),
    };
  });
  return {
    strata,
    total: Math.max(0, ...strata.map((s) => s.wilson)),
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
