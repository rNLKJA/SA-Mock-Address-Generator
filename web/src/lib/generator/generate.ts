/**
 * The revived generator. The address recipe is the original one (a suburb,
 * then randint(1, 999), then one of the 49 original street names, formatted
 * "N Street, SUBURB SA PPPP"); what changed is the reference table (ABS 2021),
 * the optional weighting the 2025 README promised, and coordinates sampled
 * inside the suburb boundary instead of a Mapbox geocode.
 */
import { STREET_NAMES } from "@/lib/original/lookup";
import { PythonRandom } from "@/lib/rng/python-random";
import type { GeometryIndex, LonLat } from "@/lib/geo";
import { MOCK_STAMP, RA_NAMES, formatFullAddress, type Suburb } from "@/lib/suburbs";
import {
  samplingProbabilities,
  type Filters,
  type WeightMode,
  type Weights,
} from "./weights";

export const MAX_COUNT = 5000;

export interface GenerateOptions {
  count: number;
  seed: number;
  mode: WeightMode;
  filters: Filters;
  weights: Weights;
  /** Sample latitude/longitude inside the suburb boundary (needs a GeometryIndex). */
  coordinates: boolean;
}

export interface MockAddress {
  id: number;
  stamp: typeof MOCK_STAMP;
  full_address: string;
  street_address: string;
  street_number: number;
  street_name: string;
  suburb: string;
  postcode: string;
  council: string;
  remoteness_level: string;
  seifa_decile_sa: number | null;
  latitude: number | null;
  longitude: number | null;
  sal_code: string;
}

export interface CategoryShares {
  /** Five remoteness areas, RA_NAMES order. */
  remoteness: number[];
  /** Ten IRSAD deciles followed by one "no SEIFA" bucket. */
  decile: number[];
}

export interface GenerateResult {
  addresses: MockAddress[];
  expected: CategoryShares;
  observed: CategoryShares;
  eligible: number;
  zeroWeight: number;
  /** Points that fell back to the label point after rejection sampling gave up. */
  coordinateFallbacks: number;
  error: string | null;
}

/** Inverse-CDF sampler over a probability vector. */
export class CumulativeSampler {
  private readonly cdf: Float64Array;
  private readonly index: Int32Array;

  constructor(probs: Float64Array) {
    const idx: number[] = [];
    for (let i = 0; i < probs.length; i++) if (probs[i] > 0) idx.push(i);
    this.index = Int32Array.from(idx);
    this.cdf = new Float64Array(idx.length);
    let acc = 0;
    idx.forEach((i, k) => {
      acc += probs[i];
      this.cdf[k] = acc;
    });
    if (idx.length) {
      // Guard against floating point drift so u in [0, 1) always lands.
      for (let k = 0; k < this.cdf.length; k++) this.cdf[k] /= acc;
      this.cdf[this.cdf.length - 1] = 1;
    }
  }

  get size(): number {
    return this.index.length;
  }

  /** Smallest k with cdf[k] > u. */
  sample(u: number): number {
    let lo = 0;
    let hi = this.cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cdf[mid] > u) hi = mid;
      else lo = mid + 1;
    }
    return this.index[lo];
  }
}

function emptyShares(): CategoryShares {
  return { remoteness: Array(RA_NAMES.length).fill(0), decile: Array(11).fill(0) };
}

function addShare(shares: CategoryShares, s: Suburb, amount: number): void {
  shares.remoteness[s.ra] += amount;
  shares.decile[s.decileSa === null ? 10 : s.decileSa - 1] += amount;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function generateMockAddresses(
  rows: readonly Suburb[],
  geometry: GeometryIndex | null,
  options: GenerateOptions,
): GenerateResult {
  const count = Math.max(0, Math.min(MAX_COUNT, Math.floor(options.count)));
  const { probs, eligible, zeroWeight, error } = samplingProbabilities(
    rows,
    options.filters,
    options.mode,
    options.weights,
  );
  const expected = emptyShares();
  const observed = emptyShares();
  if (error) {
    return {
      addresses: [],
      expected,
      observed,
      eligible,
      zeroWeight,
      coordinateFallbacks: 0,
      error,
    };
  }
  rows.forEach((s, i) => {
    if (probs[i] > 0) addShare(expected, s, probs[i]);
  });

  const rng = new PythonRandom(options.seed);
  const sampler = new CumulativeSampler(probs);
  const addresses: MockAddress[] = [];
  let coordinateFallbacks = 0;

  for (let n = 0; n < count; n++) {
    const s = rows[sampler.sample(rng.random())];
    const streetNumber = rng.randint(1, 999);
    const streetName = rng.choice(STREET_NAMES);

    let point: LonLat | null = null;
    if (options.coordinates && geometry) {
      point = geometry.samplePoint(s.code, rng);
      if (!point) {
        point = s.label;
        coordinateFallbacks++;
      }
    }
    addShare(observed, s, 1);
    addresses.push({
      id: n + 1,
      stamp: MOCK_STAMP,
      full_address: formatFullAddress(streetNumber, streetName, s.name, s.postcode),
      street_address: `${streetNumber} ${streetName}`,
      street_number: streetNumber,
      street_name: streetName,
      suburb: s.name,
      postcode: s.postcode,
      council: s.council,
      remoteness_level: RA_NAMES[s.ra],
      seifa_decile_sa: s.decileSa,
      latitude: point ? round6(point[1]) : null,
      longitude: point ? round6(point[0]) : null,
      sal_code: s.code,
    });
  }
  return {
    addresses,
    expected,
    observed,
    eligible,
    zeroWeight,
    coordinateFallbacks,
    error: null,
  };
}
