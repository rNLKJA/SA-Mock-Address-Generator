/**
 * Sampling weights. The two weight tables are copied verbatim from
 * original/config.py, where they were defined but never applied.
 */
import { RA_NAMES, type Suburb } from "@/lib/suburbs";

/** `DEFAULT_REMOTENESS_WEIGHTS` from original/config.py. */
export const CONFIG_REMOTENESS_WEIGHTS: Readonly<Record<string, number>> = {
  "Major Cities of Australia": 0.4,
  "Inner Regional Australia": 0.25,
  "Outer Regional Australia": 0.2,
  "Remote Australia": 0.1,
  "Very Remote Australia": 0.05,
  "Not Applicable": 0.0,
};

/** `DEFAULT_SOCIOECONOMIC_WEIGHTS` from original/config.py (bands 0-5). */
export const CONFIG_SOCIOECONOMIC_WEIGHTS: Readonly<Record<number, number>> = {
  0: 0.05,
  1: 0.1,
  2: 0.2,
  3: 0.25,
  4: 0.25,
  5: 0.15,
};

export type WeightMode = "uniform" | "remoteness" | "seifa" | "population" | "stratified";

export const WEIGHT_MODES: { value: WeightMode; label: string; hint: string }[] = [
  {
    value: "uniform",
    label: "Uniform (as built in 2025)",
    hint: "Every matching suburb is equally likely, which is what the original code actually did.",
  },
  {
    value: "remoteness",
    label: "Remoteness weights",
    hint: "Pick a remoteness area with the config.py weights, then a suburb inside it.",
  },
  {
    value: "seifa",
    label: "SEIFA decile weights",
    hint: "Pick an IRSAD decile with the config.py socio-economic weights, then a suburb inside it.",
  },
  {
    value: "population",
    label: "Population weighted",
    hint: "Suburbs are chosen in proportion to their 2021 Census usual residents.",
  },
  {
    value: "stratified",
    label: "Stratified by remoteness (fixed quotas)",
    hint: "Each remoteness area gets a fixed quota from the weights below (largest remainder), then suburbs are drawn uniformly inside it. The mix is exact, not random.",
  },
];

/** config.py remoteness weights in RA_NAMES order. */
export function configRemotenessWeights(): number[] {
  return RA_NAMES.map((name) => CONFIG_REMOTENESS_WEIGHTS[name]);
}

/**
 * config.py has six socio-economic bands (0-5) with no stated definition. The
 * revival spreads them over the ten IRSAD deciles: decile d belongs to band
 * round((d - 1) * 5 / 9), and each band's weight is split evenly across its
 * deciles, so band totals are preserved.
 */
export function bandForDecile(decile: number): number {
  return Math.round(((decile - 1) * 5) / 9);
}

export function configDecileWeights(): number[] {
  const deciles = Array.from({ length: 10 }, (_, i) => i + 1);
  const perBand = new Map<number, number>();
  for (const d of deciles)
    perBand.set(bandForDecile(d), (perBand.get(bandForDecile(d)) ?? 0) + 1);
  return deciles.map((d) => {
    const band = bandForDecile(d);
    return CONFIG_SOCIOECONOMIC_WEIGHTS[band] / (perBand.get(band) ?? 1);
  });
}

export const EQUAL_DECILE_WEIGHTS: readonly number[] = Array(10).fill(0.1);
export const EQUAL_REMOTENESS_WEIGHTS: readonly number[] = Array(5).fill(0.2);

/**
 * Split `count` into whole-number quotas proportional to `weights` with the
 * largest-remainder (Hamilton) method: floor every exact share, then hand the
 * leftover units to the largest fractional parts (ties go to the earlier
 * stratum). Quotas sum to `count`; a zero weight always gets zero.
 */
export function allocateQuotas(count: number, weights: readonly number[]): number[] {
  const w = weights.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = w.reduce((a, b) => a + b, 0);
  const n = Math.max(0, Math.floor(count));
  if (!(total > 0) || n === 0) return w.map(() => 0);
  const exact = w.map((v) => (n * v) / total);
  const quotas = exact.map(Math.floor);
  let left = n - quotas.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .filter(({ i }) => w[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) {
    quotas[order[k].i]++;
  }
  return quotas;
}

/**
 * The smallest count N such that every stratum with positive weight gets at
 * least one address for N and for every larger count. Beyond
 * ceil(total / smallest weight) each exact share is at least 1, so its floor
 * is too; below that, largest remainder can still reach every stratum, and the
 * search walks down from the bound while it does.
 */
export function minCountForEveryStratum(weights: readonly number[]): number {
  const w = weights.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const live = w.filter((v) => v > 0);
  if (live.length === 0) return 0;
  const total = live.reduce((a, b) => a + b, 0);
  const reachesAll = (n: number) =>
    allocateQuotas(n, w).every((q, i) => w[i] === 0 || q > 0);
  let n = Math.ceil(total / Math.min(...live) - 1e-9);
  while (!reachesAll(n)) n++; // floating-point safety at the bound
  while (n - 1 >= live.length && reachesAll(n - 1)) n--;
  return n;
}

/**
 * Whether "Equal per area" would give every area that has eligible suburbs at
 * least one address at this count. With k such areas and equal weights,
 * largest remainder gives each at least floor(count / k), so it helps exactly
 * when count >= k and the weights over those areas are not already equal.
 */
export function equalSharesWouldHelp(
  count: number,
  weights: readonly number[],
  hasSuburbs: readonly boolean[],
): boolean {
  const areas = hasSuburbs.flatMap((ok, h) => (ok ? [h] : []));
  if (areas.length === 0 || count < areas.length) return false;
  const w = areas.map((h) => {
    const v = weights[h] ?? 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  return w.some((v) => Math.abs(v - w[0]) > 1e-12);
}

export interface Filters {
  /** Upper-case suburb name. */
  suburb?: string | null;
  council?: string | null;
  ra?: number | null;
  decile?: number | null;
}

export interface Weights {
  /** One weight per remoteness area, RA_NAMES order. */
  remoteness: readonly number[];
  /** One weight per IRSAD decile 1..10. */
  decile: readonly number[];
}

export function defaultWeights(): Weights {
  return { remoteness: configRemotenessWeights(), decile: configDecileWeights() };
}

/** Indices of addressable suburbs that pass every active filter (AND). */
export function eligibleIndices(rows: readonly Suburb[], filters: Filters): number[] {
  const suburb = filters.suburb?.trim().toUpperCase() || null;
  const council = filters.council?.trim().toUpperCase() || null;
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (!r.addressable) return;
    if (suburb && r.name !== suburb) return;
    if (council && r.council.toUpperCase() !== council) return;
    if (filters.ra !== null && filters.ra !== undefined && r.ra !== filters.ra) return;
    if (
      filters.decile !== null &&
      filters.decile !== undefined &&
      r.decileSa !== filters.decile
    )
      return;
    out.push(i);
  });
  return out;
}

export interface Probabilities {
  /** Probability per row of `rows` (zero for ineligible rows). Sums to 1 when ok. */
  probs: Float64Array;
  eligible: number;
  /** Eligible suburbs that end up with zero probability (e.g. no SEIFA decile). */
  zeroWeight: number;
  error: string | null;
}

function groupedProbabilities(
  rows: readonly Suburb[],
  eligible: number[],
  groupOf: (s: Suburb) => number | null,
  weightOf: (group: number) => number,
): Float64Array | null {
  const counts = new Map<number, number>();
  for (const i of eligible) {
    const g = groupOf(rows[i]);
    if (g === null) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let total = 0;
  for (const g of counts.keys()) total += Math.max(0, weightOf(g));
  if (!(total > 0)) return null;
  const probs = new Float64Array(rows.length);
  for (const i of eligible) {
    const g = groupOf(rows[i]);
    if (g === null) continue;
    const w = Math.max(0, weightOf(g));
    if (w > 0) probs[i] = w / total / (counts.get(g) ?? 1);
  }
  return probs;
}

/**
 * Exact per-suburb sampling probabilities for a mode. Category modes renormalise
 * the weights over the categories that still have suburbs after filtering.
 */
export function samplingProbabilities(
  rows: readonly Suburb[],
  filters: Filters,
  mode: WeightMode,
  weights: Weights = defaultWeights(),
): Probabilities {
  const eligible = eligibleIndices(rows, filters);
  const empty = (error: string): Probabilities => ({
    probs: new Float64Array(rows.length),
    eligible: eligible.length,
    zeroWeight: eligible.length,
    error,
  });
  if (eligible.length === 0) return empty("No suburb matches these filters.");

  let probs: Float64Array | null;
  if (mode === "uniform") {
    probs = new Float64Array(rows.length);
    for (const i of eligible) probs[i] = 1 / eligible.length;
  } else if (mode === "remoteness" || mode === "stratified") {
    probs = groupedProbabilities(
      rows,
      eligible,
      (s) => s.ra,
      (g) => weights.remoteness[g] ?? 0,
    );
    if (!probs) return empty("Every matching remoteness area has a weight of zero.");
  } else if (mode === "seifa") {
    probs = groupedProbabilities(
      rows,
      eligible,
      (s) => s.decileSa,
      (d) => weights.decile[d - 1] ?? 0,
    );
    if (!probs) {
      return empty("No matching suburb has a SEIFA decile with a positive weight.");
    }
  } else {
    const total = eligible.reduce((sum, i) => sum + rows[i].pop, 0);
    if (total <= 0) return empty("The matching suburbs have no recorded residents.");
    probs = new Float64Array(rows.length);
    for (const i of eligible) probs[i] = rows[i].pop / total;
  }
  const zeroWeight = eligible.filter((i) => probs[i] === 0).length;
  return { probs, eligible: eligible.length, zeroWeight, error: null };
}
