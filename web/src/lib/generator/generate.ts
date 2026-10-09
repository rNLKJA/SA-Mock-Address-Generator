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
  allocateQuotas,
  minCountForEveryStratum,
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
  /**
   * Stratified design only: the fixed number of addresses per remoteness area
   * (RA_NAMES order). Null for the random designs.
   */
  quotas: number[] | null;
  /**
   * Stratified design only: areas (RA_NAMES indices) that have eligible
   * suburbs with positive weight but were allocated no addresses because the
   * count is too small, and the smallest count from which every such area
   * always gets one. Null when every live area got at least one.
   */
  emptyQuotas: { areas: number[]; minCount: number } | null;
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

/** Coordinates are published to 6 decimal places (about 0.1 m). */
export const roundPoint = ([lon, lat]: LonLat): LonLat => [round6(lon), round6(lat)];

/**
 * Seed for the coordinate stream: the address seed shifted into the high
 * 32-bit word with a fixed low word, so it never collides with an address
 * seed (all of which fit in 32 bits) and stays a pure function of the seed.
 */
export function coordinateSeed(seed: number): bigint {
  return (BigInt(seed) << BigInt(32)) + BigInt(0x9e3779b9);
}

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
      quotas: null,
      emptyQuotas: null,
      expected,
      observed,
      eligible,
      zeroWeight,
      coordinateFallbacks: 0,
      error,
    };
  }
  const plan =
    options.mode === "stratified"
      ? stratifiedPlan(rows, probs, count, options.weights.remoteness)
      : null;
  if (plan) {
    // The design fixes each area's share at quota / count; inside an area,
    // suburbs are equally likely.
    plan.within.forEach((within, h) => {
      const share = count > 0 ? plan.quotas[h] / count : 0;
      if (share > 0)
        rows.forEach((s, i) => {
          if (within[i] > 0) addShare(expected, s, share * within[i]);
        });
    });
  } else {
    rows.forEach((s, i) => {
      if (probs[i] > 0) addShare(expected, s, probs[i]);
    });
  }

  // Two independent streams: `rng` drives the original recipe (suburb, number,
  // street) and `coordRng` only feeds rejection sampling inside the boundary.
  // Turning coordinates on or off therefore never changes the addresses.
  const rng = new PythonRandom(options.seed);
  const coordRng =
    options.coordinates && geometry
      ? new PythonRandom(coordinateSeed(options.seed))
      : null;
  const sampler = new CumulativeSampler(probs);
  // Stratified: the area for each address comes from a shuffled schedule of
  // the quotas (Fisher-Yates with the same stream, as Python's random.shuffle).
  const schedule = plan ? shuffledSchedule(plan.quotas, rng) : null;
  const addresses: MockAddress[] = [];
  let coordinateFallbacks = 0;

  for (let n = 0; n < count; n++) {
    const u = rng.random();
    const s =
      rows[schedule && plan ? plan.samplers[schedule[n]]!.sample(u) : sampler.sample(u)];
    const streetNumber = rng.randint(1, 999);
    const streetName = rng.choice(STREET_NAMES);

    let point: LonLat | null = null;
    if (coordRng && geometry) {
      point = geometry.samplePoint(s.code, coordRng, 2000, roundPoint);
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
    quotas: plan ? plan.quotas : null,
    emptyQuotas: plan ? emptyQuotas(plan) : null,
    expected,
    observed,
    eligible,
    zeroWeight,
    coordinateFallbacks,
    error: null,
  };
}

export interface StratifiedPlan {
  /** Addresses per remoteness area (RA_NAMES order), summing to the count. */
  quotas: number[];
  /** Each area's weight where it has eligible suburbs, zero elsewhere. */
  live: number[];
  /** Uniform probabilities over each area's eligible suburbs (zero elsewhere). */
  within: Float64Array[];
  samplers: (CumulativeSampler | null)[];
}

/**
 * Quotas for the stratified design: the remoteness weights, renormalised over
 * the areas that still have eligible suburbs with positive weight, allocated
 * by largest remainder. `probs` are the per-suburb probabilities from
 * samplingProbabilities (zero for ineligible or zero-weight suburbs).
 */
export function stratifiedPlan(
  rows: readonly Suburb[],
  probs: Float64Array,
  count: number,
  weights: readonly number[],
): StratifiedPlan {
  const strata = RA_NAMES.length;
  const members: number[][] = Array.from({ length: strata }, () => []);
  rows.forEach((s, i) => {
    if (probs[i] > 0) members[s.ra].push(i);
  });
  const live = members.map((m, h) => (m.length > 0 ? Math.max(0, weights[h] ?? 0) : 0));
  const quotas = allocateQuotas(count, live);
  const within = members.map((m) => {
    const p = new Float64Array(rows.length);
    for (const i of m) p[i] = 1 / m.length;
    return p;
  });
  return {
    quotas,
    live,
    within,
    samplers: within.map((p, h) => (members[h].length ? new CumulativeSampler(p) : null)),
  };
}

function emptyQuotas(plan: StratifiedPlan): GenerateResult["emptyQuotas"] {
  const areas = plan.quotas.flatMap((q, h) => (q === 0 && plan.live[h] > 0 ? [h] : []));
  return areas.length ? { areas, minCount: minCountForEveryStratum(plan.live) } : null;
}

/** The quota schedule [0,0,...,1,1,...] shuffled in place with Python's algorithm. */
export function shuffledSchedule(
  quotas: readonly number[],
  rng: { randint(a: number, b: number): number },
): Int32Array {
  const total = quotas.reduce((a, b) => a + b, 0);
  const out = new Int32Array(total);
  let k = 0;
  quotas.forEach((q, h) => {
    for (let j = 0; j < q; j++) out[k++] = h;
  });
  for (let i = total - 1; i > 0; i--) {
    const j = rng.randint(0, i);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}
