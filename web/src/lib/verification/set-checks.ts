/**
 * Set-level checks for the Verification Lab: does the set as a whole match
 * the design it claims to come from?
 *
 *  1. Distribution: remoteness and IRSAD decile counts against the design's
 *     target shares, with the test the site's Target check uses (exact,
 *     chi-square or Monte Carlo, always reporting Pearson's statistic, df and
 *     Cohen's w) and a 95% Wilson interval per class.
 *  2. Spatial spread: the mean nearest-neighbour distance (the site's own
 *     nearestNeighbourDistances) against re-draws of the same suburbs under
 *     the design, plus the classic Clark-Evans ratio where one suburb holds
 *     enough points.
 *  3. Reproducibility: two serialisations compared byte for byte.
 */
import type { MockAddress } from "@/lib/generator/generate";
import { roundPoint } from "@/lib/generator/generate";
import type { GeometryIndex, LonLat } from "@/lib/geo";
import { PythonRandom } from "@/lib/rng/python-random";
import {
  FIT_METHOD_LABEL,
  chiSquareSf,
  clarkEvans,
  cohensWLabel,
  goodnessOfFit,
  holmAdjust,
  nearestNeighbourDistances,
  percentileRange,
  polygonMetrics,
  projector,
  wilson,
  type XY,
} from "@/lib/stats";
import { RA_NAMES, RA_SHORT, type Suburb } from "@/lib/suburbs";
import { formatInt, formatP } from "@/lib/utils";
import type {
  DistributionCheck,
  DistributionDetails,
  DistributionRow,
  HolmAdjustment,
  ReproducibilityCheck,
  ReproducibilityDetails,
  SpatialCheck,
  SpatialDetails,
} from "./types";

export const ALPHA = 0.05;
/** Below this many addresses no distribution test is run (as on /generate). */
export const MIN_TEST_N = 10;
/** Below this many addresses a pass comes with a power caveat. */
export const LOW_POWER_N = 100;
/** Seed for Monte Carlo p-values, the same one the Target check uses. */
export const FIT_SEED = 2025;

export const DECILE_LABELS = [
  ...Array.from({ length: 10 }, (_, i) => `Decile ${i + 1}`),
  "No SEIFA",
];

/* ---------------------------------------------------------------------------
 * Distribution
 * ------------------------------------------------------------------------- */

export interface ObservedCounts {
  /** Five remoteness areas, RA_NAMES order. */
  remoteness: number[];
  /** Ten IRSAD deciles, then "no SEIFA". */
  decile: number[];
  /** Rows whose class is not one the generator can produce. */
  unrecognised: { remoteness: number; decile: number };
}

/** Class counts from the rows' own remoteness and decile columns. */
export function observedCounts(addresses: readonly MockAddress[]): ObservedCounts {
  const out: ObservedCounts = {
    remoteness: Array(RA_NAMES.length).fill(0),
    decile: Array(11).fill(0),
    unrecognised: { remoteness: 0, decile: 0 },
  };
  for (const a of addresses) {
    const ra = (RA_NAMES as readonly string[]).indexOf(a.remoteness_level);
    if (ra >= 0) out.remoteness[ra]++;
    else out.unrecognised.remoteness++;
    const d = a.seifa_decile_sa;
    if (d === null) out.decile[10]++;
    else if (Number.isInteger(d) && d >= 1 && d <= 10) out.decile[d - 1]++;
    else out.unrecognised.decile++;
  }
  return out;
}

const DIMENSION_NAME = { remoteness: "Remoteness", decile: "IRSAD decile" } as const;

/** Holm's adjustment applied to one check's p-value, across `tests` checks. */
export type Holm = HolmAdjustment;

/** "p = 0.03" or "p = 0.03 (Holm-adjusted p = 0.09 across 3 tests)". */
function pText(p: number, holm: Holm | null): string {
  return holm && holm.tests > 1
    ? `${formatP(p)} (Holm-adjusted ${formatP(holm.pAdjusted)} across ${holm.tests} tests)`
    : formatP(p);
}

/**
 * Class counts against the design's target shares: Wilson intervals per class
 * and the goodness-of-fit test the site's Target check uses. `quotas` marks a
 * stratified remoteness check, where the counts are fixed by design.
 */
export function distributionDetails(
  dimension: "remoteness" | "decile",
  observed: readonly number[],
  target: readonly number[],
  {
    unrecognised = 0,
    quotas = null,
    alpha = ALPHA,
  }: { unrecognised?: number; quotas?: readonly number[] | null; alpha?: number } = {},
): DistributionDetails {
  const labels = dimension === "remoteness" ? [...RA_SHORT] : DECILE_LABELS;
  const total = target.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const n = observed.reduce((s, v) => s + v, 0) + unrecognised;
  const rows: DistributionRow[] = labels
    .map((label, i) => {
      const k = observed[i] ?? 0;
      const [lo, hi] = wilson(k, n);
      const t = Math.max(0, target[i] ?? 0) / total;
      return {
        label,
        k,
        share: n ? k / n : 0,
        lo,
        hi,
        target: t,
        targetInside: t >= lo && t <= hi,
      };
    })
    .filter((r) => r.k > 0 || r.target > 0);
  const impossible =
    rows.filter((r) => r.target === 0).reduce((s, r) => s + r.k, 0) + unrecognised;
  const fit =
    n >= MIN_TEST_N ? goodnessOfFit(observed, target, { seed: FIT_SEED }) : null;
  return {
    dimension,
    n,
    rows,
    alpha,
    impossible,
    quotas: quotas ? [...quotas] : null,
    observed: [...observed],
    test: fit
      ? {
          chiSquare: fit.statistic,
          df: fit.df,
          chiSquareP: chiSquareSf(fit.statistic, fit.df),
          method: fit.method,
          pValue: impossible > 0 ? 0 : fit.pValue,
          replicates: fit.replicates,
          cohensW: fit.w,
        }
      : null,
    holm: null,
  };
}

/** Whether the check's verdict rests on its p-value (and so joins the Holm family). */
export function distributionIsTested(d: DistributionDetails): boolean {
  return !d.quotas && d.n >= MIN_TEST_N && d.impossible === 0 && d.test !== null;
}

/** The verdict and its wording, from the details and (optionally) Holm's adjustment. */
export function distributionCheck(
  details: DistributionDetails,
  holm: Holm | null = null,
): DistributionCheck {
  const d = { ...details, holm };
  const { dimension, n, rows, alpha, impossible, quotas, test, observed } = d;
  const base = {
    kind: "distribution" as const,
    id: `distribution-${dimension}`,
    label: `${DIMENSION_NAME[dimension]} mix against the design's targets`,
    details: d,
  };
  const outside = rows.filter((r) => !r.targetInside).length;
  const intervals =
    outside === 0
      ? "Every target lies inside its 95% Wilson interval."
      : `${formatInt(rows.length - outside)} of ${formatInt(rows.length)} targets lie inside their 95% Wilson interval.`;
  const stat = test
    ? `χ²(${test.df}) = ${test.chiSquare.toFixed(2)}, asymptotic ${formatP(test.chiSquareP)}${
        test.method === "chi-square"
          ? ""
          : `, ${FIT_METHOD_LABEL[test.method]}${test.replicates ? ` (${formatInt(test.replicates)} draws, seed ${FIT_SEED})` : ""} ${formatP(test.pValue)}`
      }${holm && holm.tests > 1 ? `, Holm-adjusted ${formatP(holm.pAdjusted)} across ${holm.tests} tests` : ""}, Cohen's w = ${test.cohensW.toFixed(3)} (${cohensWLabel(test.cohensW)}), n = ${formatInt(n)}.`
    : "";

  if (quotas) {
    const exact = quotas.every((q, h) => (observed[h] ?? 0) === q) && d.impossible === 0;
    return {
      ...base,
      status: exact ? "pass" : "fail",
      summary: exact
        ? `Counts are fixed by the stratified design and equal the quotas exactly (${quotas.map(formatInt).join(" / ")}), so there is no sampling variation to test. ${stat}`
        : `The stratified design fixes the counts at ${quotas.map(formatInt).join(" / ")}, but the set has ${quotas.map((_, h) => formatInt(observed[h] ?? 0)).join(" / ")}. ${stat}`,
    };
  }
  if (n < MIN_TEST_N) {
    return {
      ...base,
      status: "not-run",
      summary: `With only ${formatInt(n)} addresses a test could flag nothing short of an extreme mix, so none is run. Check at least ${MIN_TEST_N}. ${intervals}`,
    };
  }
  if (impossible > 0) {
    return {
      ...base,
      status: "fail",
      summary: `${formatInt(impossible)} of ${formatInt(n)} addresses fall in classes this design gives zero weight, so the set cannot have come from it. ${stat}`,
    };
  }
  if (!test) {
    return {
      ...base,
      status: "not-run",
      summary: `Only one class is in play under this design, so there is nothing to test. ${intervals}`,
    };
  }
  const p = holm ? holm.pAdjusted : test.pValue;
  if (p >= alpha) {
    const power =
      n < LOW_POWER_N
        ? ` With only ${formatInt(n)} addresses the test can only detect large departures, so this is weak evidence of a match.`
        : "";
    return {
      ...base,
      status: "pass",
      summary: `Consistent with the design's targets at α = ${alpha}: ${stat} ${intervals}${power}`,
    };
  }
  return {
    ...base,
    status: "fail",
    summary: `The set departs from the design's targets by more than chance would explain at α = ${alpha}: ${stat} ${intervals}`,
  };
}

/** Details and verdict in one call, at α with no adjustment. */
export function checkDistribution(
  dimension: "remoteness" | "decile",
  observed: readonly number[],
  target: readonly number[],
  options: {
    unrecognised?: number;
    quotas?: readonly number[] | null;
    alpha?: number;
  } = {},
): DistributionCheck {
  return distributionCheck(distributionDetails(dimension, observed, target, options));
}

/* ---------------------------------------------------------------------------
 * Spatial spread
 * ------------------------------------------------------------------------- */

/** Points one suburb needs before the classic Clark-Evans ratio is shown. */
export const CLARK_EVANS_MIN = 20;

export const SPATIAL_LIMITATION =
  "A nearest-neighbour statistic only sees how far points sit from each other. It catches points piled together (for example one geocoded point per suburb, as in 2025) and spacing that is too regular, but not every departure from uniform: points pushed to one side of every suburb can pass. The classic Clark-Evans ratio assumes complete spatial randomness in a single region, and Donnelly's edge correction was derived for rectangles, so for irregular suburbs it is an approximation that needs many points in one suburb. A statewide set has a point or two per suburb, so the lab compares the set with re-draws of the same suburbs instead. Both use the simplified boundaries the generator samples from.";

function meanNn(points: readonly XY[]): number {
  const nn = nearestNeighbourDistances(points);
  let s = 0;
  for (const d of nn) s += d;
  return s / nn.length;
}

/** Re-draws per check: fewer for big sets so the check stays a few seconds. */
export function spatialReplicates(points: number): number {
  if (points <= 1000) return 199;
  if (points <= 2500) return 99;
  return 59;
}

/**
 * Mean nearest-neighbour distance of the set against `replicates` re-draws of
 * the same suburbs, each point uniform inside its boundary (the generator's
 * own seeded rejection sampler), with a two-sided Monte Carlo p-value. This
 * is Clark and Evans's statistic with the expectation taken under the
 * generator's design instead of complete spatial randomness over one region.
 * Returns the reason instead when there is nothing to measure.
 */
export function spatialDetails(
  addresses: readonly MockAddress[],
  index: GeometryIndex,
  byCode: ReadonlyMap<string, Suburb>,
  {
    replicates,
    seed = FIT_SEED,
    alpha = ALPHA,
  }: { replicates?: number; seed?: number; alpha?: number } = {},
): SpatialDetails | string {
  const located = addresses.filter(
    (a) =>
      a.latitude !== null &&
      a.longitude !== null &&
      Number.isFinite(a.latitude) &&
      Number.isFinite(a.longitude) &&
      index.geometry(a.sal_code),
  );
  if (located.length < 2) {
    return located.length === 0
      ? "The set has no coordinates inside a known suburb boundary (coordinates may have been turned off), so there is no spread to test."
      : "Only one point has coordinates inside a known boundary: nearest-neighbour distances need at least two.";
  }
  const B = replicates ?? spatialReplicates(located.length);
  const lonLats: LonLat[] = located.map((a) => [a.longitude!, a.latitude!]);
  const lon0 = lonLats.reduce((s, p) => s + p[0], 0) / lonLats.length;
  const lat0 = lonLats.reduce((s, p) => s + p[1], 0) / lonLats.length;
  const project = projector(lon0, lat0);
  const observed = meanNn(lonLats.map(project));

  // Same suburbs, same counts, fresh uniform points.
  const perSuburb = new Map<string, number>();
  for (const a of located)
    perSuburb.set(a.sal_code, (perSuburb.get(a.sal_code) ?? 0) + 1);
  const codes = [...perSuburb.keys()].sort();
  const rng = new PythonRandom(seed);
  const sims: number[] = [];
  const buffer: XY[] = new Array(located.length);
  for (let b = 0; b < B; b++) {
    let k = 0;
    for (const code of codes) {
      const fallback = byCode.get(code)?.label ?? null;
      for (let j = perSuburb.get(code)!; j > 0; j--) {
        const p = index.samplePoint(code, rng, 2000, roundPoint) ?? fallback;
        buffer[k++] = project(p ?? [lon0, lat0]);
      }
    }
    sims.push(meanNn(buffer));
  }
  const expected = sims.reduce((s, v) => s + v, 0) / B;
  const [simLo, simHi] = percentileRange(sims, 0.95);
  const atMost = sims.filter((v) => v <= observed).length;
  const atLeast = sims.filter((v) => v >= observed).length;
  const pValue = Math.min(1, (2 * (1 + Math.min(atMost, atLeast))) / (B + 1));

  // The classic ratio where one suburb holds enough points to say anything.
  let busiest: string | null = null;
  for (const code of codes)
    if (!busiest || perSuburb.get(code)! > perSuburb.get(busiest)!) busiest = code;
  let ce: SpatialDetails["clarkEvans"] = null;
  if (busiest && perSuburb.get(busiest)! >= CLARK_EVANS_MIN) {
    const metrics = polygonMetrics(index.geometry(busiest)!);
    const local = projector(metrics.centre[0], metrics.centre[1]);
    const pts = located
      .filter((a) => a.sal_code === busiest)
      .map((a) => local([a.longitude!, a.latitude!]));
    const result = clarkEvans(pts, metrics.areaKm2, metrics.perimeterKm);
    if (result)
      ce = { ...result, suburb: byCode.get(busiest)?.name ?? busiest, code: busiest };
  }
  return {
    points: located.length,
    suburbs: codes.length,
    meanNnKm: observed,
    expectedNnKm: expected,
    ratio: expected > 0 ? observed / expected : 0,
    simLo,
    simHi,
    pValue,
    replicates: B,
    seed,
    alpha,
    clarkEvans: ce,
    clarkEvansMin: CLARK_EVANS_MIN,
    holm: null,
  };
}

const km = (v: number) => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));

export function spatialCheck(
  details: SpatialDetails | string,
  holm: Holm | null = null,
): SpatialCheck {
  const base = {
    kind: "spatial" as const,
    id: "spatial-spread",
    label: "Spatial spread inside the suburbs",
    limitation: SPATIAL_LIMITATION,
  };
  if (typeof details === "string")
    return { ...base, status: "not-run", summary: details, details: null };
  const d = { ...details, holm };
  const stat = `Mean nearest-neighbour distance ${km(d.meanNnKm)} km against ${km(d.expectedNnKm)} km expected from ${formatInt(d.replicates)} re-draws of the same ${d.suburbs === 1 ? "suburb" : `${formatInt(d.suburbs)} suburbs`} (middle 95%: ${km(d.simLo)} to ${km(d.simHi)} km), ratio R = ${d.ratio.toFixed(3)}, two-sided Monte Carlo ${pText(d.pValue, holm)}, seed ${d.seed}.`;
  const ce = d.clarkEvans;
  const classic = ce
    ? ` Classic Clark-Evans for ${ce.suburb} (${formatInt(ce.n)} points): R = ${ce.r.toFixed(3)}, z = ${ce.z.toFixed(2)}, ${formatP(ce.pValue)}.`
    : "";
  const pass = (holm ? holm.pAdjusted : d.pValue) >= d.alpha;
  return {
    ...base,
    status: pass ? "pass" : "fail",
    summary: pass
      ? `Spread consistent with points drawn uniformly inside each suburb at α = ${d.alpha}. ${stat}${classic}`
      : `The points are ${d.ratio < 1 ? "more clustered" : "more evenly spaced"} than uniform draws inside the same suburbs would be at α = ${d.alpha}. ${stat}${classic}`,
    details: d,
  };
}

/** Details and verdict in one call, at α with no adjustment. */
export function checkSpatialSpread(
  addresses: readonly MockAddress[],
  index: GeometryIndex,
  byCode: ReadonlyMap<string, Suburb>,
  options: { replicates?: number; seed?: number; alpha?: number } = {},
): SpatialCheck {
  return spatialCheck(spatialDetails(addresses, index, byCode, options));
}

/* ---------------------------------------------------------------------------
 * The statistical checks as one family
 * ------------------------------------------------------------------------- */

/**
 * The distribution and spatial checks, decided together: their p-values are
 * adjusted with Holm's method so that an honest set fails any of them about
 * 1 time in 20 at most, not about 1 in 7 as three separate 5% tests would.
 * Checks whose verdict does not rest on a p-value (fixed quotas, impossible
 * classes, too few addresses) are left out of the family.
 */
export function decideStatisticalChecks(
  distributions: readonly DistributionDetails[],
  spatial: SpatialDetails | string,
): { distributions: DistributionCheck[]; spatial: SpatialCheck } {
  const family: { kind: "distribution" | "spatial"; i: number; p: number }[] = [];
  distributions.forEach((d, i) => {
    if (distributionIsTested(d))
      family.push({ kind: "distribution", i, p: d.test!.pValue });
  });
  if (typeof spatial !== "string")
    family.push({ kind: "spatial", i: 0, p: spatial.pValue });
  const adjusted = holmAdjust(family.map((f) => f.p));
  const holmFor = (kind: "distribution" | "spatial", i: number): Holm | null => {
    const k = family.findIndex((f) => f.kind === kind && f.i === i);
    return k >= 0 ? { pAdjusted: adjusted[k], tests: family.length } : null;
  };
  return {
    distributions: distributions.map((d, i) =>
      distributionCheck(d, holmFor("distribution", i)),
    ),
    spatial: spatialCheck(spatial, holmFor("spatial", 0)),
  };
}

/* ---------------------------------------------------------------------------
 * Reproducibility
 * ------------------------------------------------------------------------- */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}

function firstDifference(
  a: string,
  b: string,
): ReproducibilityDetails["firstDifference"] {
  if (a === b) return null;
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      const clip = (s: string | undefined) =>
        s === undefined ? "(no line)" : s.replace(/\r$/, "").slice(0, 160);
      return { line: i + 1, a: clip(la[i]), b: clip(lb[i]) };
    }
  }
  return { line: la.length, a: "", b: "" };
}

/**
 * Compares two serialisations byte for byte (UTF-8), with a SHA-256 of each.
 * `a` is the set under test, `b` the regeneration.
 */
export async function checkReproducibility(
  a: string,
  b: string,
  {
    compared,
    seed,
    count,
  }: { compared: ReproducibilityDetails["compared"]; seed: number; count: number },
): Promise<ReproducibilityCheck> {
  const enc = new TextEncoder();
  const bytesA = enc.encode(a);
  const bytesB = enc.encode(b);
  let identical = bytesA.length === bytesB.length;
  for (let i = 0; identical && i < bytesA.length; i++)
    if (bytesA[i] !== bytesB[i]) identical = false;
  const [sha256A, sha256B] = await Promise.all([sha256Hex(bytesA), sha256Hex(bytesB)]);
  const what =
    compared === "regenerated-twice"
      ? `Regenerated seed ${seed} with n = ${formatInt(count)} a second time`
      : `Regenerated seed ${seed} with n = ${formatInt(count)} and compared it with the CSV you gave`;
  const diff = identical ? null : firstDifference(a, b);
  return {
    kind: "reproducibility",
    id: "reproducibility",
    label: "Reproducible from the seed",
    status: identical ? "pass" : "fail",
    summary: identical
      ? `${what}: byte-identical CSV (${formatInt(bytesA.length)} bytes, SHA-256 ${sha256A.slice(0, 16)}…).`
      : `${what}: the bytes differ (${formatInt(bytesA.length)} against ${formatInt(bytesB.length)} bytes${diff ? `, first at line ${formatInt(diff.line)}` : ""}).`,
    details: {
      compared,
      seed,
      count,
      bytesA: bytesA.length,
      bytesB: bytesB.length,
      sha256A,
      sha256B,
      identical,
      firstDifference: diff,
    },
  };
}

export function reproducibilityNotRun(reason: string): ReproducibilityCheck {
  return {
    kind: "reproducibility",
    id: "reproducibility",
    label: "Reproducible from the seed",
    status: "not-run",
    summary: reason,
    details: null,
  };
}
