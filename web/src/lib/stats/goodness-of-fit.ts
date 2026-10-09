/**
 * Goodness of fit of observed category counts to target probabilities:
 * Pearson's chi-square (asymptotic), the exact multinomial test (complete
 * enumeration) and a seeded Monte Carlo version of the chi-square test for
 * samples too large to enumerate but too sparse for the asymptotics.
 * `goodnessOfFit` picks between them and reports which it used.
 */
import { PythonRandom } from "@/lib/rng/python-random";
import { chiSquareSf, logGamma } from "./distributions";

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

/** Cohen's w effect size for a goodness-of-fit chi-square: sqrt(chi2 / n). */
export function cohensW(statistic: number, n: number): number {
  return n > 0 ? Math.sqrt(statistic / n) : 0;
}

/** Conventional labels for Cohen's w (0.1 small, 0.3 medium, 0.5 large). */
export function cohensWLabel(w: number): "negligible" | "small" | "medium" | "large" {
  if (w < 0.1) return "negligible";
  if (w < 0.3) return "small";
  if (w < 0.5) return "medium";
  return "large";
}

/** log C(n + k - 1, k - 1): the number of possible count vectors, in logs. */
export function logOutcomeCount(n: number, k: number): number {
  if (k <= 1) return 0;
  return logGamma(n + k) - logGamma(k) - logGamma(n + 1);
}

/** Normalised probabilities over categories with a positive target. */
function positiveCategories(
  observed: readonly number[],
  probs: readonly number[],
): { counts: number[]; p: number[]; impossible: number } | null {
  const total = probs.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(total > 0)) return null;
  const counts: number[] = [];
  const p: number[] = [];
  let impossible = 0;
  for (let i = 0; i < observed.length; i++) {
    const pi = Math.max(0, probs[i] ?? 0) / total;
    if (pi > 0) {
      counts.push(observed[i]);
      p.push(pi);
    } else impossible += observed[i];
  }
  return { counts, p, impossible };
}

export interface ExactMultinomial {
  pValue: number;
  /** Probability of the observed count vector under the target. */
  probObserved: number;
  /** Count vectors enumerated. */
  outcomes: number;
  categories: number;
}

/**
 * Exact multinomial goodness-of-fit test: the p-value is the total probability
 * of every count vector with the same n that is no more likely than the one
 * observed (the "probability" ordering, as in R's EMT::multinomial.test).
 * Enumerates all C(n + k - 1, k - 1) vectors, so it returns null when there
 * would be more than `maxOutcomes`.
 */
export function exactMultinomialTest(
  observed: readonly number[],
  probs: readonly number[],
  maxOutcomes = 200_000,
): ExactMultinomial | null {
  const cats = positiveCategories(observed, probs);
  if (!cats) return null;
  const { counts, p } = cats;
  const k = counts.length;
  const n = counts.reduce((s, v) => s + v, 0);
  if (cats.impossible > 0) {
    // A count in a zero-probability category cannot happen under the target.
    return { pValue: 0, probObserved: 0, outcomes: 0, categories: k };
  }
  if (n === 0 || k < 2) return null;
  if (logOutcomeCount(n, k) > Math.log(maxOutcomes)) return null;

  const logFact = new Float64Array(n + 1);
  for (let i = 2; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  const logP = p.map(Math.log);
  const logPmf = (x: readonly number[]) =>
    x.reduce((s, xi, i) => s + xi * logP[i] - logFact[xi], logFact[n]);
  const observedLog = logPmf(counts);
  // Relative tolerance for ties, as in R's binom.test / EMT.
  const threshold = observedLog + Math.log1p(1e-7);

  let pValue = 0;
  let outcomes = 0;
  const walk = (i: number, remaining: number, acc: number) => {
    if (i === k - 1) {
      const lp = acc + remaining * logP[i] - logFact[remaining];
      outcomes++;
      if (lp <= threshold) pValue += Math.exp(lp);
      return;
    }
    for (let x = 0; x <= remaining; x++) {
      walk(i + 1, remaining - x, acc + x * logP[i] - logFact[x]);
    }
  };
  walk(0, n, logFact[n]);
  return {
    pValue: Math.min(1, pValue),
    probObserved: Math.exp(observedLog),
    outcomes,
    categories: k,
  };
}

export interface MonteCarloFit {
  statistic: number;
  pValue: number;
  replicates: number;
  seed: number;
}

/**
 * Chi-square goodness of fit with a simulated p-value, as R's
 * chisq.test(simulate.p.value = TRUE): draw `replicates` samples of size n
 * from the target, and report (1 + #{simulated >= observed}) / (B + 1).
 * Seeded, so the same inputs always give the same p-value.
 */
export function monteCarloGoodnessOfFit(
  observed: readonly number[],
  probs: readonly number[],
  { replicates = 2000, seed = 2025 }: { replicates?: number; seed?: number } = {},
): MonteCarloFit | null {
  const cats = positiveCategories(observed, probs);
  if (!cats) return null;
  const { counts, p } = cats;
  const k = counts.length;
  const n = counts.reduce((s, v) => s + v, 0);
  if (n === 0 || k < 2) return null;
  const expected = p.map((pi) => pi * n);
  const chi2 = (x: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += (x[i] - expected[i]) ** 2 / expected[i];
    return s;
  };
  const statistic = cats.impossible > 0 ? Infinity : chi2(counts);
  const cdf = new Float64Array(k);
  let acc = 0;
  for (let i = 0; i < k; i++) cdf[i] = acc += p[i];
  cdf[k - 1] = 1;
  const rng = new PythonRandom(seed);
  const sim = new Int32Array(k);
  // R's almost.1: guards against floating-point ties with the observed value.
  const bar = statistic * (1 - 64 * Number.EPSILON);
  let atLeast = 0;
  for (let b = 0; b < replicates; b++) {
    sim.fill(0);
    for (let j = 0; j < n; j++) {
      const u = rng.random();
      let lo = 0;
      let hi = k - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cdf[mid] > u) hi = mid;
        else lo = mid + 1;
      }
      sim[lo]++;
    }
    if (chi2(sim) >= bar) atLeast++;
  }
  return { statistic, pValue: (1 + atLeast) / (replicates + 1), replicates, seed };
}

export type FitMethod = "exact" | "chi-square" | "monte-carlo";

export interface FitResult extends GoodnessOfFit {
  method: FitMethod;
  n: number;
  /** Cohen's w from the Pearson statistic. */
  w: number;
  /** Monte Carlo replicates and seed, when method = "monte-carlo". */
  replicates?: number;
  seed?: number;
}

export const FIT_METHOD_LABEL: Record<FitMethod, string> = {
  exact: "exact multinomial test",
  "chi-square": "Pearson chi-square test",
  "monte-carlo": "chi-square test with a Monte Carlo p-value",
};

/**
 * The test this lab reports: exact when the sample is small enough to
 * enumerate, the asymptotic chi-square when every expected count is at least 5,
 * and a seeded Monte Carlo p-value otherwise. The Pearson statistic, df and
 * Cohen's w are reported in every case.
 */
export function goodnessOfFit(
  observed: readonly number[],
  probs: readonly number[],
  options: { seed?: number; maxOutcomes?: number; simulationBudget?: number } = {},
): FitResult | null {
  const pearson = chiSquareGoodnessOfFit(observed, probs);
  if (!pearson) return null;
  const n = observed.reduce((s, v) => s + v, 0);
  const base = { ...pearson, n, w: cohensW(pearson.statistic, n) };
  const exact = exactMultinomialTest(observed, probs, options.maxOutcomes);
  if (exact) return { ...base, method: "exact", pValue: exact.pValue };
  if (pearson.lowExpected === 0) return { ...base, method: "chi-square" };
  // Keep the simulation to about `simulationBudget` draws in total.
  const budget = options.simulationBudget ?? 4_000_000;
  const replicates = Math.max(500, Math.min(10_000, Math.floor(budget / Math.max(1, n))));
  const seed = options.seed ?? 2025;
  const mc = monteCarloGoodnessOfFit(observed, probs, { replicates, seed });
  if (!mc) return { ...base, method: "chi-square" };
  return { ...base, method: "monte-carlo", pValue: mc.pValue, replicates, seed };
}

export interface TestSizes {
  n: number;
  /** Count vectors enumerated. */
  outcomes: number;
  alpha: number;
  /** P(exact multinomial test rejects | target is true). */
  exact: number;
  /** P(asymptotic chi-square test rejects | target is true). */
  chiSquare: number;
  /** P(the two tests disagree about rejecting). */
  disagree: number;
}

/**
 * The true size (false-alarm rate) of the exact multinomial and Pearson
 * chi-square tests at level `alpha` when the counts really are
 * Multinomial(n, probs): every possible count vector is enumerated and its
 * probability added up wherever a test would reject. No simulation, no seed.
 */
export function exactTestSizes(
  n: number,
  probs: readonly number[],
  alpha = 0.05,
  maxOutcomes = 1_000_000,
): TestSizes | null {
  const total = probs.reduce((a, b) => a + Math.max(0, b), 0);
  const p = probs.filter((v) => v > 0).map((v) => v / total);
  const k = p.length;
  if (k < 2 || n < 1 || logOutcomeCount(n, k) > Math.log(maxOutcomes)) return null;
  const logFact = new Float64Array(n + 1);
  for (let i = 2; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  const logP = p.map(Math.log);
  const expected = p.map((v) => v * n);
  const pmf: number[] = [];
  const chi: number[] = [];
  const x = new Array<number>(k).fill(0);
  const walk = (i: number, remaining: number, acc: number) => {
    if (i === k - 1) {
      x[i] = remaining;
      pmf.push(Math.exp(acc + remaining * logP[i] - logFact[remaining]));
      let s = 0;
      for (let j = 0; j < k; j++) s += (x[j] - expected[j]) ** 2 / expected[j];
      chi.push(s);
      return;
    }
    for (let v = 0; v <= remaining; v++) {
      x[i] = v;
      walk(i + 1, remaining - v, acc + v * logP[i] - logFact[v]);
    }
  };
  walk(0, n, logFact[n]);
  // Exact p-value of each vector: total probability of vectors no more likely.
  const order = pmf.map((_, i) => i).sort((a, b) => pmf[a] - pmf[b]);
  const pValue = new Float64Array(pmf.length);
  let cum = 0;
  let j = 0;
  for (let r = 0; r < order.length; r++) {
    const bar = pmf[order[r]] * (1 + 1e-7);
    while (j < order.length && pmf[order[j]] <= bar) cum += pmf[order[j++]];
    pValue[order[r]] = cum;
  }
  let exact = 0;
  let chiSquare = 0;
  let disagree = 0;
  for (let i = 0; i < pmf.length; i++) {
    const e = pValue[i] < alpha;
    const c = chiSquareSf(chi[i], k - 1) < alpha;
    if (e) exact += pmf[i];
    if (c) chiSquare += pmf[i];
    if (e !== c) disagree += pmf[i];
  }
  return { n, outcomes: pmf.length, alpha, exact, chiSquare, disagree };
}
