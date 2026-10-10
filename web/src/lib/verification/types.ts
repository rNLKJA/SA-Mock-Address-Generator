/**
 * Types for the verification lab.
 */
import type { MockAddress } from "@/lib/generator/generate";
import type { FitResult } from "@/lib/stats/goodness-of-fit";
import type { ClarkEvans } from "@/lib/stats/spatial";

export interface VerificationInput {
  addresses: MockAddress[];
  /** Settings the generator used, for reproducibility checks. */
  seed?: number;
  count?: number;
  mode?: string;
}

export interface RecordCheck {
  id: string;
  label: string;
  passed: number;
  failed: number;
  /** Failing row IDs (address.id). */
  failedIds: number[];
}

export interface SetCheck {
  id: string;
  label: string;
  passed: boolean;
  message: string;
  /** Optional statistical details. */
  details?: unknown;
}

export interface VerificationResult {
  timestamp: string;
  seed: number | null;
  count: number;
  recordChecks: RecordCheck[];
  setChecks: SetCheck[];
  /** Total failing rows across all record checks (union of failedIds). */
  totalFailedRows: number;
  /** All unique failing row IDs. */
  allFailedIds: number[];
}

export interface DistributionCheck extends SetCheck {
  details: {
    fit: FitResult;
    dimension: "remoteness" | "decile";
  };
}

export interface SpatialCheck extends SetCheck {
  details: ClarkEvans;
}

export interface ReproducibilityCheck extends SetCheck {
  details: {
    originalSeed: number;
    rerunMatches: boolean;
  };
}
