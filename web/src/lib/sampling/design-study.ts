/**
 * Replicate study of the three sampling designs the generator offers, run
 * through the real generator (not a re-implementation) with fixed seeds:
 *
 *  - uniform: every eligible suburb equally likely (what the 2025 code did);
 *  - weighted: pick a remoteness area with the config.py weights, then a
 *    suburb inside it, independently for each address (counts are random,
 *    Multinomial(n, w));
 *  - stratified: fixed quotas from the same weights, uniform inside each
 *    area (counts are fixed by design).
 *
 * The target for every design is the config.py remoteness mix that the 2025
 * README promised. For each design the study reports, per remoteness area,
 * the spread of the realised share across seeds, how often the 95% Wilson
 * interval covers the target, and how often a goodness-of-fit test at 5%
 * rejects the target (its size for the weighted design, its power against the
 * uniform design). The stratified design fixes every count, so it is reported
 * as fixed by design: a coverage or rejection rate with a binomial interval
 * would put spurious uncertainty around a deterministic outcome.
 */
import { generateMockAddresses } from "@/lib/generator/generate";
import {
  configRemotenessWeights,
  defaultWeights,
  type WeightMode,
} from "@/lib/generator/weights";
import {
  exactTestSizes,
  goodnessOfFit,
  mean,
  percentileRange,
  sd,
  wilson,
  type FitResult,
  type TestSizes,
} from "@/lib/stats";
import { RA_SHORT, type Suburb } from "@/lib/suburbs";

export type DesignId = "uniform" | "weighted" | "stratified";

export const DESIGNS: {
  id: DesignId;
  mode: WeightMode;
  label: string;
  summary: string;
}[] = [
  {
    id: "uniform",
    mode: "uniform",
    label: "Uniform (2025)",
    summary: "Every suburb equally likely, as the 2025 code actually behaved.",
  },
  {
    id: "weighted",
    mode: "remoteness",
    label: "Weighted",
    summary:
      "Each address independently picks a remoteness area with the config.py weights, then a suburb.",
  },
  {
    id: "stratified",
    mode: "stratified",
    label: "Stratified",
    summary:
      "Fixed quotas per remoteness area (largest remainder), then suburbs uniformly inside each.",
  },
];

/** A proportion with its 95% Wilson interval. */
export interface Rate {
  k: number;
  n: number;
  rate: number;
  lo: number;
  hi: number;
}

export function rate(k: number, n: number): Rate {
  const [lo, hi] = wilson(k, n);
  return { k, n, rate: n ? k / n : 0, lo, hi };
}

export interface StratumSummary {
  label: string;
  target: number;
  /** Share this design draws in expectation (its own design probability). */
  designShare: number;
  meanShare: number;
  /** 2.5th and 97.5th percentiles of the realised share across seeds. */
  range: [number, number];
  sd: number;
  /** Multinomial SD sqrt(p(1 - p)/n) at the design share (0 for fixed quotas). */
  theorySd: number;
  /** Seeds whose 95% Wilson interval contains the target (null when fixed by design). */
  coverage: Rate | null;
}

export interface DesignSummary {
  id: DesignId;
  label: string;
  summary: string;
  strata: StratumSummary[];
  /**
   * True when the design fixes every count (stratified quotas): there is no
   * sampling variation in the mix, so nothing is tested.
   */
  fixedByDesign: boolean;
  /** Seeds whose realised shares all equal the target exactly. */
  seedsOnTarget: number;
  /** Seeds where the goodness-of-fit test rejects the target at 5% (null when fixed). */
  rejection: Rate | null;
  /** Cohen's w against the target: mean and 2.5-97.5 percentile range. */
  w: { mean: number; range: [number, number] };
}

export interface DesignStudy {
  n: number;
  replicates: number;
  /** Seeds used: firstSeed, firstSeed + 1, ... */
  firstSeed: number;
  target: number[];
  designs: DesignSummary[];
}

/** Realised remoteness counts for one run of the generator (no coordinates). */
export function remotenessCounts(
  rows: readonly Suburb[],
  mode: WeightMode,
  count: number,
  seed: number,
): { counts: number[]; expected: number[] } {
  const r = generateMockAddresses(rows, null, {
    count,
    seed,
    mode,
    filters: {},
    weights: defaultWeights(),
    coordinates: false,
  });
  if (r.error) throw new Error(r.error);
  return { counts: r.observed.remoteness, expected: r.expected.remoteness };
}

export function runDesignStudy(
  rows: readonly Suburb[],
  { n = 1000, replicates = 200, firstSeed = 1 } = {},
): DesignStudy {
  const target = configRemotenessWeights();
  const designs = DESIGNS.map((d) => {
    const shares: number[][] = RA_SHORT.map(() => []);
    const covered = RA_SHORT.map(() => 0);
    const ws: number[] = [];
    let rejected = 0;
    let onTarget = 0;
    let designShare: number[] = [];
    for (let r = 0; r < replicates; r++) {
      const { counts, expected } = remotenessCounts(rows, d.mode, n, firstSeed + r);
      designShare = expected;
      if (counts.every((k, h) => Math.abs(k / n - target[h]) < 1e-12)) onTarget++;
      counts.forEach((k, h) => {
        shares[h].push(k / n);
        const [lo, hi] = wilson(k, n);
        if (target[h] >= lo && target[h] <= hi) covered[h]++;
      });
      const fit = goodnessOfFit(counts, target);
      if (fit) {
        ws.push(fit.w);
        if (fit.pValue < 0.05) rejected++;
      }
    }
    const fixedByDesign = d.id === "stratified";
    const strata: StratumSummary[] = RA_SHORT.map((label, h) => ({
      label,
      target: target[h],
      designShare: designShare[h],
      meanShare: mean(shares[h]),
      range: percentileRange(shares[h]),
      sd: sd(shares[h]),
      theorySd: fixedByDesign
        ? 0
        : Math.sqrt((designShare[h] * (1 - designShare[h])) / n),
      coverage: fixedByDesign ? null : rate(covered[h], replicates),
    }));
    return {
      id: d.id,
      label: d.label,
      summary: d.summary,
      strata,
      fixedByDesign,
      seedsOnTarget: onTarget,
      rejection: fixedByDesign ? null : rate(rejected, replicates),
      w: { mean: mean(ws), range: percentileRange(ws) },
    };
  });
  return { n, replicates, firstSeed, target, designs };
}

export interface SingleSampleRow {
  label: string;
  k: number;
  share: number;
  lo: number;
  hi: number;
  target: number;
  expected: number;
  /** Pearson residual (O - E) / sqrt(E). */
  residual: number;
}

export interface SingleSample {
  design: DesignId;
  n: number;
  seed: number;
  rows: SingleSampleRow[];
  fit: FitResult;
}

/** One seeded sample against the config.py target, with Wilson intervals per area. */
export function singleSample(
  rows: readonly Suburb[],
  design: DesignId,
  n: number,
  seed: number,
): SingleSample {
  const mode = DESIGNS.find((d) => d.id === design)!.mode;
  const target = configRemotenessWeights();
  const { counts } = remotenessCounts(rows, mode, n, seed);
  const fit = goodnessOfFit(counts, target, { seed })!;
  return {
    design,
    n,
    seed,
    fit,
    rows: RA_SHORT.map((label, h) => {
      const [lo, hi] = wilson(counts[h], n);
      const expected = target[h] * n;
      return {
        label,
        k: counts[h],
        share: counts[h] / n,
        lo,
        hi,
        target: target[h],
        expected,
        residual: (counts[h] - expected) / Math.sqrt(expected),
      };
    }),
  };
}

/**
 * How often each test raises a false alarm at 5% when weighted samples of a
 * small size really do follow the target: computed exactly by enumerating
 * every possible count vector (no seeds involved).
 */
export function smallSampleSizes(ns: readonly number[] = [10, 20, 30, 40]): TestSizes[] {
  const target = configRemotenessWeights();
  return ns
    .map((n) => exactTestSizes(n, target))
    .filter((s): s is TestSizes => s !== null);
}
