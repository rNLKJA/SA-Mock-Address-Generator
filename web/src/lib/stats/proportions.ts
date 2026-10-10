/**
 * Intervals for a single proportion.
 */
import { Z95 } from "./distributions";

/**
 * Wilson score interval for a binomial proportion k/n. At k = 0 the lower
 * bound is exactly 0 and at k = n the upper bound is exactly 1, as in the
 * algebra: floating point would otherwise land a hair inside (for example
 * 0.9999999999999998 at 300 of 300), and a target of 100% would then read
 * as outside its own interval.
 */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [
    k <= 0 ? 0 : Math.max(0, centre - half),
    k >= n ? 1 : Math.min(1, centre + half),
  ];
}

/**
 * Half-width of the Wilson interval when the observed share equals `p`
 * exactly (the planning value). Used by the sample-size calculator.
 */
export function wilsonHalfWidth(p: number, n: number, z = Z95): number {
  if (n <= 0) return 0.5;
  const z2 = z * z;
  return (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/**
 * Exact (Clopper-Pearson) one-sided upper bound for a proportion after zero
 * events in n trials: 1 - alpha^(1/n). With alpha = 0.05 this is close to the
 * "rule of three", 3/n.
 */
export function zeroEventUpperBound(n: number, alpha = 0.05): number {
  if (n <= 0) return 1;
  return 1 - alpha ** (1 / n);
}
