/** Shared fixtures for the Verification Lab tests: the real reference data. */
import { GeometryIndex } from "@/lib/geo";
import {
  generateMockAddresses,
  type GenerateOptions,
  type MockAddress,
} from "@/lib/generator/generate";
import { defaultWeights } from "@/lib/generator/weights";
import { RA_NAMES, type Suburb } from "@/lib/suburbs";
import { verifyContext } from "@/lib/verification/verify";
import { salGeojson, suburbsJson } from "./data";

export const rows = suburbsJson.rows;
export const index = new GeometryIndex(salGeojson);
export const ctx = verifyContext(rows, index);
export const byCode: ReadonlyMap<string, Suburb> = ctx.byCode;
export const byName = new Map(rows.map((r) => [r.name, r]));

export function options(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    count: 200,
    seed: 2025,
    mode: "uniform",
    filters: {},
    weights: defaultWeights(),
    coordinates: true,
    ...overrides,
  };
}

/** A set straight from the site's generator. */
export function generated(overrides: Partial<GenerateOptions> = {}): MockAddress[] {
  const r = generateMockAddresses(rows, index, options(overrides));
  if (r.error) throw new Error(r.error);
  return r.addresses;
}

/** A copy of `addresses` with row `id` changed. */
export function broken(
  addresses: readonly MockAddress[],
  id: number,
  change: Partial<MockAddress>,
): MockAddress[] {
  return addresses.map((a) => (a.id === id ? { ...a, ...change } : { ...a }));
}

/** A copy of a generated row moved to another suburb, every field kept consistent. */
export function asSuburb(a: MockAddress, s: Suburb): MockAddress {
  return {
    ...a,
    suburb: s.name,
    postcode: s.postcode,
    council: s.council,
    remoteness_level: RA_NAMES[s.ra],
    seifa_decile_sa: s.decileSa,
    full_address: `${a.street_number} ${a.street_name}, ${s.name} SA ${s.postcode}`,
    sal_code: s.code,
    latitude: a.latitude === null ? null : s.label[1],
    longitude: a.longitude === null ? null : s.label[0],
  };
}
