/**
 * The optional live spot check on /verify: reverse-geocode a few sampled
 * points through the site's /api/geocode Photon proxy and compare the suburb
 * and postcode OpenStreetMap gives for each point with the record's.
 *
 * The addresses are synthetic (random street numbers on a fixed list of
 * street names), so a street-level match is not expected and not compared.
 */
import type { MockAddress } from "@/lib/generator/generate";
import { PythonRandom } from "@/lib/rng/python-random";
import { displayName, type Suburb } from "@/lib/suburbs";
import type { GeocodeResult } from "@/lib/photon";
import type { SpotPoint } from "./types";

/** Never more than this many requests per spot check. */
export const SPOT_CHECK_MAX = 10;
/** Gap between requests, so a run of 10 takes about 10 seconds. */
export const SPOT_CHECK_GAP_MS = 1100;
/**
 * At most one run per minute: 10 requests a minute per visitor, a third of
 * the proxy's limit of 30, which the lookup page shares.
 */
export const SPOT_CHECK_COOLDOWN_MS = 60_000;

/** Milliseconds until another run may start (0 when it may start now). */
export function spotCheckWait(lastStartedAt: number | null, now: number): number {
  if (lastStartedAt === null) return 0;
  return Math.max(0, lastStartedAt + SPOT_CHECK_COOLDOWN_MS - now);
}

/**
 * Up to `max` rows with coordinates, drawn without replacement with a seeded
 * partial Fisher-Yates shuffle (so the same set always offers the same points),
 * returned in id order.
 */
export function spotSample(
  addresses: readonly MockAddress[],
  byCode: ReadonlyMap<string, Suburb>,
  seed: number,
  max = SPOT_CHECK_MAX,
): SpotPoint[] {
  const pool = addresses.filter(
    (a) =>
      a.latitude !== null &&
      a.longitude !== null &&
      Number.isFinite(a.latitude) &&
      Number.isFinite(a.longitude),
  );
  const rng = new PythonRandom(seed);
  const k = Math.min(Math.max(0, max), pool.length, SPOT_CHECK_MAX);
  for (let i = 0; i < k; i++) {
    const j = rng.randint(i, pool.length - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool
    .slice(0, k)
    .sort((a, b) => a.id - b.id)
    .map((a) => {
      const s = byCode.get(a.sal_code);
      return {
        id: a.id,
        full_address: a.full_address,
        suburb: a.suburb,
        suburbOfficial: s ? displayName(s) : a.suburb,
        postcode: a.postcode,
        postcodes: s?.postcodes ?? [a.postcode],
        latitude: a.latitude!,
        longitude: a.longitude!,
      };
    });
}

/** Upper case, without "(SA)", punctuation or repeated spaces, for comparing names. */
export function normalisePlace(name: string): string {
  return name
    .replace(/\s*\(SA\)\s*$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SpotOutcome {
  /** Photon's place names for the point. */
  places: string[];
  postcode: string | null;
  /** null when Photon gave no answer for that field. */
  suburbAgrees: boolean | null;
  postcodeAgrees: boolean | null;
}

/** Compares Photon's answer for a point with the record's suburb and postcode. */
export function compareSpot(point: SpotPoint, hit: GeocodeResult | null): SpotOutcome {
  if (!hit)
    return { places: [], postcode: null, suburbAgrees: null, postcodeAgrees: null };
  const places = hit.photonPlaces?.length
    ? hit.photonPlaces
    : hit.photonLocality
      ? [hit.photonLocality]
      : [];
  const wanted = new Set([
    normalisePlace(point.suburb),
    normalisePlace(point.suburbOfficial),
  ]);
  const postcode = hit.photonPostcode;
  return {
    places,
    postcode,
    suburbAgrees: places.length
      ? places.some((p) => wanted.has(normalisePlace(p)))
      : null,
    postcodeAgrees: postcode
      ? postcode === point.postcode || point.postcodes.includes(postcode)
      : null,
  };
}

export interface SpotSummary {
  checked: number;
  answered: number;
  suburbAgree: number;
  suburbAsked: number;
  postcodeAgree: number;
  postcodeAsked: number;
}

export function summariseSpots(outcomes: readonly (SpotOutcome | null)[]): SpotSummary {
  const done = outcomes.filter((o): o is SpotOutcome => o !== null);
  return {
    checked: done.length,
    answered: done.filter((o) => o.places.length > 0 || o.postcode !== null).length,
    suburbAgree: done.filter((o) => o.suburbAgrees === true).length,
    suburbAsked: done.filter((o) => o.suburbAgrees !== null).length,
    postcodeAgree: done.filter((o) => o.postcodeAgrees === true).length,
    postcodeAsked: done.filter((o) => o.postcodeAgrees !== null).length,
  };
}
