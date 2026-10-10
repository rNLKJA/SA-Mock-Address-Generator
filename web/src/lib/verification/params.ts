/**
 * The /generate → /verify hand-off: every generator setting that changes the
 * output travels in the URL, so /verify can regenerate the identical set with
 * the site's own generator. Weights and the coordinates switch are only
 * written when they differ from the defaults, to keep the link short.
 */
import { MAX_COUNT, type GenerateOptions } from "@/lib/generator/generate";
import {
  WEIGHT_MODES,
  defaultWeights,
  type Filters,
  type WeightMode,
  type Weights,
} from "@/lib/generator/weights";
import { RA_NAMES } from "@/lib/suburbs";

const MODES = new Set<string>(WEIGHT_MODES.map((m) => m.value));
const MAX_SEED = 0xffffffff;

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Query string for /verify that reproduces `options` exactly. */
export function verifySearch(options: GenerateOptions): string {
  const q = new URLSearchParams();
  q.set("seed", String(options.seed));
  q.set("count", String(options.count));
  q.set("mode", options.mode);
  const f = options.filters;
  if (f.suburb) q.set("suburb", f.suburb);
  if (f.council) q.set("council", f.council);
  if (f.ra !== null && f.ra !== undefined) q.set("ra", String(f.ra));
  if (f.decile !== null && f.decile !== undefined) q.set("decile", String(f.decile));
  const d = defaultWeights();
  if (!sameList(options.weights.remoteness, d.remoteness))
    q.set("rw", options.weights.remoteness.join(","));
  if (!sameList(options.weights.decile, d.decile))
    q.set("dw", options.weights.decile.join(","));
  if (!options.coordinates) q.set("coords", "0");
  return q.toString();
}

export function verifyHref(options: GenerateOptions): string {
  return `/verify?${verifySearch(options)}`;
}

export type ParsedVerifyParams =
  | { kind: "none" }
  | { kind: "ok"; options: GenerateOptions }
  | { kind: "error"; error: string };

function wholeNumber(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) ? n : null;
}

function weightList(raw: string | null, length: number): number[] | null | "bad" {
  if (raw === null) return null;
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length !== length || parts.some((v) => !Number.isFinite(v) || v < 0))
    return "bad";
  return parts;
}

/**
 * Reads the hand-off from a query string. No seed means no hand-off (the page
 * then waits for a CSV), and a seed with anything invalid is an error to show.
 */
export function parseVerifyParams(
  params: Pick<URLSearchParams, "get" | "has">,
): ParsedVerifyParams {
  if (!params.has("seed")) return { kind: "none" };
  const seed = wholeNumber(params.get("seed"));
  if (seed === null || seed > MAX_SEED)
    return {
      kind: "error",
      error: "The seed must be a whole number from 0 to 4,294,967,295.",
    };
  const count = wholeNumber(params.get("count"));
  if (count === null || count < 1 || count > MAX_COUNT)
    return {
      kind: "error",
      error: `The count must be a whole number from 1 to ${MAX_COUNT.toLocaleString("en-AU")}.`,
    };
  const mode = params.get("mode") ?? "uniform";
  if (!MODES.has(mode)) return { kind: "error", error: `Unknown design "${mode}".` };

  const filters: Filters = {};
  const suburb = params.get("suburb")?.trim();
  if (suburb) filters.suburb = suburb;
  const council = params.get("council")?.trim();
  if (council) filters.council = council;
  if (params.has("ra")) {
    const ra = wholeNumber(params.get("ra"));
    if (ra === null || ra >= RA_NAMES.length)
      return { kind: "error", error: "The remoteness filter must be 0 to 4." };
    filters.ra = ra;
  }
  if (params.has("decile")) {
    const decile = wholeNumber(params.get("decile"));
    if (decile === null || decile < 1 || decile > 10)
      return { kind: "error", error: "The decile filter must be 1 to 10." };
    filters.decile = decile;
  }

  const d = defaultWeights();
  const rw = weightList(params.get("rw"), RA_NAMES.length);
  const dw = weightList(params.get("dw"), 10);
  if (rw === "bad")
    return {
      kind: "error",
      error: "Remoteness weights must be five numbers of at least 0.",
    };
  if (dw === "bad")
    return { kind: "error", error: "Decile weights must be ten numbers of at least 0." };
  const weights: Weights = { remoteness: rw ?? d.remoteness, decile: dw ?? d.decile };

  return {
    kind: "ok",
    options: {
      seed,
      count,
      mode: mode as WeightMode,
      filters,
      weights,
      coordinates: params.get("coords") !== "0",
    },
  };
}
