/**
 * Runs every Verification Lab check on a set of addresses. Two entry points:
 *
 *  - verifyHandoff: the run carried over from /generate. The set is
 *    regenerated from its settings with the site's own generator, then
 *    regenerated a second time for the byte-for-byte reproducibility check.
 *  - verifyCsv: a CSV in the site's export format, with the design (and
 *    optionally the seed) it was generated with.
 *
 * Both are pure apart from the clock, and run in a Web Worker on the page
 * (src/workers/verify.worker.ts).
 */
import {
  MAX_COUNT,
  generateMockAddresses,
  type GenerateOptions,
  type GenerateResult,
  type MockAddress,
} from "@/lib/generator/generate";
import { toCsv } from "@/lib/generator/format";
import { defaultWeights, type WeightMode } from "@/lib/generator/weights";
import type { GeometryIndex } from "@/lib/geo";
import type { Suburb } from "@/lib/suburbs";
import { runRecordChecks } from "./checks";
import { parseAddressesCSV } from "./csv-parser";
import {
  FIT_SEED,
  checkReproducibility,
  decideStatisticalChecks,
  distributionDetails,
  observedCounts,
  reproducibilityNotRun,
  spatialDetails,
} from "./set-checks";
import { spotSample } from "./spot-check";
import type {
  ReproducibilityCheck,
  VerificationResult,
  VerificationSource,
} from "./types";

export interface VerifyContext {
  rows: readonly Suburb[];
  byCode: ReadonlyMap<string, Suburb>;
  index: GeometryIndex;
}

export function verifyContext(
  rows: readonly Suburb[],
  index: GeometryIndex,
): VerifyContext {
  return { rows, byCode: new Map(rows.map((r) => [r.code, r])), index };
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

interface Assembly {
  source: VerificationSource;
  settings: GenerateOptions;
  settingsNote: string;
  seed: number | null;
  design: GenerateResult;
  reproducibility: ReproducibilityCheck;
  started: number;
  spatialReplicates?: number;
}

function assemble(
  ctx: VerifyContext,
  addresses: readonly MockAddress[],
  a: Assembly,
): VerificationResult {
  const recordChecks = runRecordChecks(addresses, ctx.byCode, ctx.index);
  const counts = observedCounts(addresses);
  const decided = decideStatisticalChecks(
    [
      distributionDetails("remoteness", counts.remoteness, a.design.expected.remoteness, {
        unrecognised: counts.unrecognised.remoteness,
        quotas: a.settings.mode === "stratified" ? a.design.quotas : null,
      }),
      distributionDetails("decile", counts.decile, a.design.expected.decile, {
        unrecognised: counts.unrecognised.decile,
      }),
    ],
    spatialDetails(addresses, ctx.index, ctx.byCode, { replicates: a.spatialReplicates }),
  );
  const setChecks = [...decided.distributions, decided.spatial, a.reproducibility];
  const failed = new Set<number>();
  for (const c of recordChecks) for (const id of c.failedIds) failed.add(id);
  const allFailedIds = [...failed].sort((x, y) => x - y);
  return {
    timestamp: new Date().toISOString(),
    source: a.source,
    settings: a.settings,
    settingsNote: a.settingsNote,
    seed: a.seed,
    count: addresses.length,
    recordChecks,
    setChecks,
    totalFailedRows: allFailedIds.length,
    allFailedIds,
    spotSample: spotSample(addresses, ctx.byCode, a.seed ?? FIT_SEED),
    ms: now() - a.started,
  };
}

/** Regenerates the run from /generate and checks it. */
export async function verifyHandoff(
  ctx: VerifyContext,
  options: GenerateOptions,
  { spatialReplicates }: { spatialReplicates?: number } = {},
): Promise<VerificationResult> {
  const started = now();
  const first = generateMockAddresses(ctx.rows, ctx.index, options);
  if (first.error) throw new Error(first.error);
  const second = generateMockAddresses(ctx.rows, ctx.index, options);
  const reproducibility = await checkReproducibility(
    toCsv(first.addresses),
    toCsv(second.addresses),
    { compared: "regenerated-twice", seed: options.seed, count: options.count },
  );
  return assemble(ctx, first.addresses, {
    source: "generate",
    settings: options,
    settingsNote:
      "Carried over from /generate and regenerated in this browser with the site's own generator, so the set checked here is the one you generated.",
    seed: options.seed,
    design: first,
    reproducibility,
    started,
    spatialReplicates,
  });
}

/** The site's CSV with CRLF line endings, a final newline and no byte order mark. */
export function canonicalCsvText(text: string): string {
  const body = text.replace(/^\uFEFF/, "").replace(/\r?\n/g, "\r\n");
  return body.endsWith("\r\n") ? body : `${body}\r\n`;
}

export interface CsvVerifyOptions {
  /** The design the CSV was generated with (targets assume no filters, default weights). */
  mode: WeightMode;
  /** The seed, when known: enables the reproducibility check. */
  seed: number | null;
}

/** Parses a CSV in the site's export format and checks it. */
export async function verifyCsv(
  ctx: VerifyContext,
  csvText: string,
  { mode, seed }: CsvVerifyOptions,
  { spatialReplicates }: { spatialReplicates?: number } = {},
): Promise<VerificationResult> {
  const started = now();
  const parsed = parseAddressesCSV(csvText);
  if (parsed.errors.length > 0) {
    const more =
      parsed.errors.length > 5 ? `\n… and ${parsed.errors.length - 5} more` : "";
    throw new Error(
      `The CSV could not be read:\n${parsed.errors.slice(0, 5).join("\n")}${more}`,
    );
  }
  const addresses = parsed.addresses;
  if (addresses.length === 0) throw new Error("The CSV has a header but no addresses.");
  if (addresses.length > MAX_COUNT)
    throw new Error(
      `The site generates at most ${MAX_COUNT.toLocaleString("en-AU")} addresses, and this CSV has ${addresses.length.toLocaleString("en-AU")}.`,
    );
  const settings: GenerateOptions = {
    count: addresses.length,
    seed: seed ?? 0,
    mode,
    filters: {},
    weights: defaultWeights(),
    coordinates: addresses.some((a) => a.latitude !== null && a.longitude !== null),
  };
  let reproducibility: ReproducibilityCheck;
  let design: GenerateResult;
  if (seed !== null) {
    design = generateMockAddresses(ctx.rows, ctx.index, settings);
    reproducibility = await checkReproducibility(
      canonicalCsvText(csvText),
      toCsv(design.addresses),
      { compared: "input-vs-regenerated", seed, count: addresses.length },
    );
  } else {
    // The targets do not depend on the seed, so skip the coordinates.
    design = generateMockAddresses(ctx.rows, null, { ...settings, coordinates: false });
    reproducibility = reproducibilityNotRun(
      "No seed was given, so the set cannot be regenerated. Enter the seed it was generated with to compare the CSV with a fresh run byte for byte.",
    );
  }
  if (design.error) throw new Error(design.error);
  return assemble(ctx, addresses, {
    source: "csv",
    settings,
    settingsNote: `Targets assume the ${mode} design with no filters and the default weights, because a CSV does not record them. To check a filtered or re-weighted run, use "Verify these results" on /generate.`,
    seed,
    design,
    reproducibility,
    started,
    spatialReplicates,
  });
}
