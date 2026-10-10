/**
 * Types for the Verification Lab (/verify).
 */
import type { GenerateOptions } from "@/lib/generator/generate";
import type { ClarkEvans, FitMethod } from "@/lib/stats";

/** One failing row and why it failed. */
export interface RowFailure {
  id: number;
  reason: string;
}

/** A check applied to every record. */
export interface RecordCheck {
  id: string;
  label: string;
  /** What the check compares, in one sentence. */
  description: string;
  passed: number;
  failed: number;
  /** Rows the check does not apply to (no coordinates, unknown suburb). */
  skipped: number;
  /** Failing row ids (MockAddress.id), ascending. */
  failedIds: number[];
  failures: RowFailure[];
}

export type SetCheckStatus = "pass" | "fail" | "not-run";

/** One class of a distribution check, with its 95% Wilson interval. */
export interface DistributionRow {
  label: string;
  /** Addresses in the class. */
  k: number;
  share: number;
  lo: number;
  hi: number;
  /** The design's target share. */
  target: number;
  /** Whether the target lies inside the 95% interval. */
  targetInside: boolean;
}

/** The goodness-of-fit test, as the site's Target check runs it. */
export interface DistributionTest {
  /** Pearson statistic and its degrees of freedom (always reported). */
  chiSquare: number;
  df: number;
  /** Asymptotic chi-square p-value. */
  chiSquareP: number;
  /** The test the site uses at this n (exact, chi-square or Monte Carlo) and its p-value. */
  method: FitMethod;
  pValue: number;
  replicates?: number;
  cohensW: number;
}

export interface DistributionDetails {
  dimension: "remoteness" | "decile";
  n: number;
  rows: DistributionRow[];
  alpha: number;
  /** Addresses in classes the design gives zero weight (or no valid class). */
  impossible: number;
  /** Stratified remoteness only: the fixed quotas the counts must equal. */
  quotas: number[] | null;
  /** Observed counts per class (RA_NAMES order, or deciles 1 to 10 then none). */
  observed: number[];
  /** Null when fewer than two classes are in play or n is too small to test. */
  test: DistributionTest | null;
  /** Holm's adjustment across the set-level tests, when there were several. */
  holm: HolmAdjustment | null;
}

export interface HolmAdjustment {
  pAdjusted: number;
  tests: number;
}

export interface SpatialDetails {
  /** Points with coordinates. */
  points: number;
  suburbs: number;
  /** Observed mean nearest-neighbour distance (km). */
  meanNnKm: number;
  /** Mean of the same statistic over re-draws of the same suburbs. */
  expectedNnKm: number;
  /** meanNn / expected: about 1 when the spread matches the design. */
  ratio: number;
  /** Middle 95% of the re-drawn means. */
  simLo: number;
  simHi: number;
  /** Two-sided Monte Carlo p-value. */
  pValue: number;
  replicates: number;
  seed: number;
  alpha: number;
  /**
   * The classic Clark-Evans ratio (Donnelly edge correction) for the suburb
   * with the most points, when it has enough of them to say anything.
   */
  clarkEvans: (ClarkEvans & { suburb: string; code: string }) | null;
  /** Points needed in one suburb before the classic ratio is shown. */
  clarkEvansMin: number;
  holm: HolmAdjustment | null;
}

export interface ReproducibilityDetails {
  /** What was compared with what. */
  compared: "regenerated-twice" | "input-vs-regenerated";
  seed: number;
  count: number;
  bytesA: number;
  bytesB: number;
  sha256A: string;
  sha256B: string;
  identical: boolean;
  /** First differing line (1-based) and the two versions of it. */
  firstDifference: { line: number; a: string; b: string } | null;
}

interface SetCheckBase {
  id: string;
  label: string;
  status: SetCheckStatus;
  /** One-paragraph verdict with the key numbers. */
  summary: string;
}

export interface DistributionCheck extends SetCheckBase {
  kind: "distribution";
  details: DistributionDetails | null;
}

export interface SpatialCheck extends SetCheckBase {
  kind: "spatial";
  details: SpatialDetails | null;
  /** What the statistic cannot see, stated with the result. */
  limitation: string;
}

export interface ReproducibilityCheck extends SetCheckBase {
  kind: "reproducibility";
  details: ReproducibilityDetails | null;
}

export type SetCheck = DistributionCheck | SpatialCheck | ReproducibilityCheck;

/** A point offered to the optional live spot check. */
export interface SpotPoint {
  id: number;
  full_address: string;
  suburb: string;
  /** Title-case suburb name as ABS publishes it, for comparing with OSM names. */
  suburbOfficial: string;
  postcode: string;
  /** Every postcode the reference table links to the suburb. */
  postcodes: string[];
  latitude: number;
  longitude: number;
}

export type VerificationSource = "generate" | "csv";

export interface VerificationResult {
  timestamp: string;
  source: VerificationSource;
  /** Generator settings the set-level targets came from (null for none). */
  settings: GenerateOptions | null;
  /** Whether `settings` were stated (hand-off or form) or assumed. */
  settingsNote: string;
  seed: number | null;
  count: number;
  recordChecks: RecordCheck[];
  setChecks: SetCheck[];
  /** Rows failing at least one record check. */
  totalFailedRows: number;
  allFailedIds: number[];
  /** Up to 10 seeded random rows with coordinates, for the spot check. */
  spotSample: SpotPoint[];
  /** Milliseconds spent regenerating and checking (in the Web Worker). */
  ms: number;
}
