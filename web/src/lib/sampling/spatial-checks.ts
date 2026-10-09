/**
 * Spatial checks on the mock coordinates:
 *
 *  1. Point-in-polygon validation: every generated point must fall inside the
 *     suburb its address names, checked with an independent lookup over all
 *     1,696 boundaries (so a point inside an overlap or across a border fails).
 *  2. Uniformity within suburbs: the Clark-Evans nearest-neighbour ratio for
 *     a seeded sample inside each of a handful of differently shaped suburbs,
 *     repeated over many seeds to check the test's calibration, with two
 *     negative controls the statistic must flag (the 2025 approach of one
 *     geocoded point per suburb, and a clustered pattern).
 */
import type { MultiPolygon, Polygon } from "geojson";
import {
  GeometryIndex,
  pointInGeometry,
  type LonLat,
  type RandomSource,
} from "@/lib/geo";
import {
  coordinateSeed,
  generateMockAddresses,
  roundPoint,
} from "@/lib/generator/generate";
import { defaultWeights, type WeightMode } from "@/lib/generator/weights";
import { PythonRandom } from "@/lib/rng/python-random";
import {
  bootstrapPercentileCI,
  clarkEvans,
  percentileRange,
  polygonMetrics,
  projector,
  unprojector,
  type ClarkEvans,
  type XY,
} from "@/lib/stats";
import { displayName, type Suburb } from "@/lib/suburbs";
import { rate, type Rate } from "./design-study";

export interface PipValidation {
  label: string;
  detail: string;
  points: number;
  inside: Rate;
  fallbacks: number;
  failures: { suburb: string; code: string; locatedIn: string | null; point: LonLat }[];
}

/** Every generated point checked against an independent lookup over all boundaries. */
export function validateGenerated(
  rows: readonly Suburb[],
  index: GeometryIndex,
  { count = 5000, seed = 2025, mode = "uniform" as WeightMode } = {},
): PipValidation {
  const r = generateMockAddresses(rows, index, {
    count,
    seed,
    mode,
    filters: {},
    weights: defaultWeights(),
    coordinates: true,
  });
  const failures: PipValidation["failures"] = [];
  let inside = 0;
  for (const a of r.addresses) {
    const p: LonLat = [a.longitude!, a.latitude!];
    const located = index.locate(p);
    if (located === a.sal_code) inside++;
    else
      failures.push({ suburb: a.suburb, code: a.sal_code, locatedIn: located, point: p });
  }
  return {
    label: "Generator output",
    detail: `${count.toLocaleString("en-AU")} addresses, ${mode} design, seed ${seed}`,
    points: r.addresses.length,
    inside: rate(inside, r.addresses.length),
    fallbacks: r.coordinateFallbacks,
    failures,
  };
}

/**
 * A census: `perSuburb` points in every addressable suburb, drawn with the
 * generator's own sampler (rounded to 6 decimals before the inside test).
 */
export function validateCensus(
  rows: readonly Suburb[],
  index: GeometryIndex,
  { perSuburb = 5, seed = 2025 } = {},
): PipValidation {
  const rng = new PythonRandom(coordinateSeed(seed));
  const failures: PipValidation["failures"] = [];
  let points = 0;
  let inside = 0;
  let fallbacks = 0;
  const addressable = rows.filter((r) => r.addressable);
  for (const s of addressable) {
    for (let k = 0; k < perSuburb; k++) {
      let p = index.samplePoint(s.code, rng, 2000, roundPoint);
      if (!p) {
        p = s.label;
        fallbacks++;
      }
      points++;
      const located = index.locate(p);
      if (located === s.code) inside++;
      else failures.push({ suburb: s.name, code: s.code, locatedIn: located, point: p });
    }
  }
  return {
    label: "Census of every suburb",
    detail: `${perSuburb} points in each of ${addressable.length.toLocaleString("en-AU")} suburbs, seed ${seed}`,
    points,
    inside: rate(inside, points),
    fallbacks,
    failures,
  };
}

/* ---------------------------------------------------------------------------
 * Uniformity within suburbs (Clark-Evans)
 * ------------------------------------------------------------------------- */

/** Suburbs with different sizes and shapes: compact, elongated, coastal, multi-part, outback. */
export const CLARK_EVANS_SUBURBS = [
  "ADELAIDE",
  "GLENELG",
  "PORT ADELAIDE",
  "KINGSCOTE",
  "MOUNT GAMBIER",
  "COOBER PEDY",
] as const;

export interface UniformityResult {
  code: string;
  name: string;
  areaKm2: number;
  perimeterKm: number;
  compactness: number;
  parts: number;
  /** One seeded sample (the headline seed). */
  example: ClarkEvans;
  /** Edge-corrected R across seeds. */
  rMean: { estimate: number; lo: number; hi: number };
  rRange: [number, number];
  /** Seeds where the z-test rejects CSR at 5% (should be about 5%). */
  rejection: Rate;
}

export interface NegativeControl {
  name: string;
  description: string;
  result: ClarkEvans;
}

export interface UniformityStudy {
  pointsPerSuburb: number;
  replicates: number;
  headlineSeed: number;
  firstSeed: number;
  suburbs: UniformityResult[];
  controls: { suburb: string; items: NegativeControl[] };
  /** Projected (km) outline and points for the small-multiple figure. */
  figure: {
    suburb: string;
    rings: XY[][];
    uniform: XY[];
    geocoded: XY;
    clustered: XY[];
  };
}

const r3 = ([x, y]: XY): XY => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];

function geometryOf(
  fc: { features: { properties: { c: string }; geometry: Polygon | MultiPolygon }[] },
  code: string,
): Polygon | MultiPolygon {
  const f = fc.features.find((x) => String(x.properties.c) === code);
  if (!f) throw new Error(`No boundary for SAL ${code}`);
  return f.geometry;
}

function samplePoints(
  index: GeometryIndex,
  code: string,
  n: number,
  rng: RandomSource,
): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i < n; i++) {
    const p = index.samplePoint(code, rng, 2000, roundPoint);
    if (p) out.push(p);
  }
  return out;
}

/** Box-Muller normal draws from a uniform source. */
function gaussian(rng: RandomSource): number {
  const u = Math.max(rng.random(), Number.MIN_VALUE);
  const v = rng.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function runUniformityStudy(
  rows: readonly Suburb[],
  index: GeometryIndex,
  fc: { features: { properties: { c: string }; geometry: Polygon | MultiPolygon }[] },
  {
    names = CLARK_EVANS_SUBURBS as readonly string[],
    pointsPerSuburb = 200,
    replicates = 100,
    headlineSeed = 2025,
    firstSeed = 1,
  } = {},
): UniformityStudy {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const suburbs = names.map((name) => {
    const s = byName.get(name);
    if (!s) throw new Error(`Unknown suburb ${name}`);
    const geometry = geometryOf(fc, s.code);
    const m = polygonMetrics(geometry);
    const project = projector(m.centre[0], m.centre[1]);
    const run = (seed: number) => {
      const pts = samplePoints(index, s.code, pointsPerSuburb, new PythonRandom(seed));
      return clarkEvans(pts.map(project) as XY[], m.areaKm2, m.perimeterKm)!;
    };
    const example = run(headlineSeed);
    const rs: number[] = [];
    let rejected = 0;
    for (let r = 0; r < replicates; r++) {
      const ce = run(firstSeed + r);
      rs.push(ce.r);
      if (ce.pValue < 0.05) rejected++;
    }
    const boot = bootstrapPercentileCI(rs, { seed: headlineSeed, replicates: 2000 });
    return {
      code: s.code,
      name: displayName(s),
      areaKm2: m.areaKm2,
      perimeterKm: m.perimeterKm,
      compactness: m.compactness,
      parts: m.parts,
      example,
      rMean: { estimate: boot.estimate, lo: boot.lo, hi: boot.hi },
      rRange: percentileRange(rs),
      rejection: rate(rejected, replicates),
    };
  });

  // Negative controls in the first suburb.
  const s = byName.get(names[0])!;
  const geometry = geometryOf(fc, s.code);
  const m = polygonMetrics(geometry);
  const project = projector(m.centre[0], m.centre[1]);
  const unproject = unprojector(m.centre[0], m.centre[1]);
  const rng = new PythonRandom(headlineSeed);
  const geocoded: XY[] = Array.from({ length: pointsPerSuburb }, () => project(s.label));
  // A Thomas-type cluster process: 5 parents uniform in the suburb, children
  // normally scattered (sd = 4% of the suburb's width scale), kept if inside.
  const parents = samplePoints(index, s.code, 5, rng);
  const scale = 0.04 * Math.sqrt(m.areaKm2);
  const clustered: XY[] = [];
  for (let tries = 0; clustered.length < pointsPerSuburb && tries < 50_000; tries++) {
    const [px, py] = project(parents[tries % parents.length]);
    const child: XY = [px + gaussian(rng) * scale, py + gaussian(rng) * scale];
    if (pointInGeometry(unproject(child), geometry)) clustered.push(child);
  }
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const uniform = samplePoints(
    index,
    s.code,
    pointsPerSuburb,
    new PythonRandom(headlineSeed),
  );
  return {
    pointsPerSuburb,
    replicates,
    headlineSeed,
    firstSeed,
    suburbs,
    figure: {
      suburb: displayName(s),
      rings: polys.flatMap((poly) =>
        poly.map((ring) => ring.map((pt) => r3(project(pt)))),
      ),
      uniform: uniform.map((pt) => r3(project(pt))),
      geocoded: r3(project(s.label)),
      clustered: clustered.map(r3),
    },
    controls: {
      suburb: displayName(s),
      items: [
        {
          name: "2025 approach",
          description:
            "Every address in the suburb at the one point a geocoder returns for its name (here the label point).",
          result: clarkEvans(geocoded, m.areaKm2, m.perimeterKm)!,
        },
        {
          name: "Clustered",
          description:
            "Five random centres with points scattered around them: a pattern a uniform sampler must not produce.",
          result: clarkEvans(clustered, m.areaKm2, m.perimeterKm)!,
        },
      ],
    },
  };
}
