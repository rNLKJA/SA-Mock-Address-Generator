/**
 * Descriptive helpers and a seeded percentile bootstrap.
 */
import { PythonRandom } from "@/lib/rng/python-random";

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Sample standard deviation (n - 1 denominator). */
export function sd(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return Math.sqrt(s / (values.length - 1));
}

/** Quantile with linear interpolation (R type 7, NumPy's default). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** The central `level` range of the values: [q(α/2), q(1 - α/2)]. */
export function percentileRange(
  values: readonly number[],
  level = 0.95,
): [number, number] {
  const a = (1 - level) / 2;
  return [quantile(values, a), quantile(values, 1 - a)];
}

export interface BootstrapInterval {
  estimate: number;
  lo: number;
  hi: number;
  replicates: number;
  seed: number;
  level: number;
}

/**
 * Percentile bootstrap interval for a statistic of one sample (the mean by
 * default): resample with replacement `replicates` times with a seeded
 * Mersenne Twister, take the α/2 and 1 - α/2 quantiles of the replicates.
 */
export function bootstrapPercentileCI(
  values: readonly number[],
  {
    statistic = mean,
    replicates = 2000,
    seed = 2025,
    level = 0.95,
  }: {
    statistic?: (v: readonly number[]) => number;
    replicates?: number;
    seed?: number;
    level?: number;
  } = {},
): BootstrapInterval {
  const n = values.length;
  const estimate = statistic(values);
  if (n === 0) {
    return { estimate, lo: Number.NaN, hi: Number.NaN, replicates, seed, level };
  }
  const rng = new PythonRandom(seed);
  const reps = new Array<number>(replicates);
  const sample = new Array<number>(n);
  for (let b = 0; b < replicates; b++) {
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rng.random() * n)];
    reps[b] = statistic(sample);
  }
  const [lo, hi] = percentileRange(reps, level);
  return { estimate, lo, hi, replicates, seed, level };
}
