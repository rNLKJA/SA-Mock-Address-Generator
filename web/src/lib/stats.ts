/**
 * Statistics for the "did the sample hit the target?" panel: Wilson score
 * intervals for each category share and a chi-square goodness-of-fit test.
 */

/** z for a two-sided 95% interval. */
export const Z95 = 1.959963984540054;

/** Wilson score interval for a binomial proportion k/n. */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Lanczos approximation of ln Γ(x) for x > 0. */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x) (Numerical Recipes gser/gcf). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Survival function of the chi-square distribution, P(X >= x). */
export function chiSquareSf(x: number, df: number): number {
  if (df <= 0) return Number.NaN;
  return gammaQ(df / 2, x / 2);
}

export interface GoodnessOfFit {
  statistic: number;
  df: number;
  pValue: number;
  /** Smallest expected count among the categories tested. */
  minExpected: number;
  /** Categories with an expected count below 5 (Cochran's rule of thumb). */
  lowExpected: number;
  categories: number;
}

/**
 * Pearson chi-square goodness-of-fit of observed counts against target
 * probabilities. Categories with zero target probability are left out (the
 * sampler can never produce them).
 */
export function chiSquareGoodnessOfFit(
  observed: readonly number[],
  probs: readonly number[],
): GoodnessOfFit | null {
  const n = observed.reduce((s, v) => s + v, 0);
  const totalP = probs.reduce((s, v) => s + v, 0);
  if (n === 0 || totalP <= 0) return null;
  let statistic = 0;
  let categories = 0;
  let minExpected = Infinity;
  let lowExpected = 0;
  for (let i = 0; i < observed.length; i++) {
    const p = probs[i] / totalP;
    if (p <= 0) continue;
    const e = n * p;
    statistic += (observed[i] - e) ** 2 / e;
    categories++;
    minExpected = Math.min(minExpected, e);
    if (e < 5) lowExpected++;
  }
  if (categories < 2) return null;
  const df = categories - 1;
  return {
    statistic,
    df,
    pValue: chiSquareSf(statistic, df),
    minExpected,
    lowExpected,
    categories,
  };
}
