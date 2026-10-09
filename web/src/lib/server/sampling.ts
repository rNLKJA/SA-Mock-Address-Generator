import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { GeometryIndex, type SalProperties } from "@/lib/geo";
import {
  runDesignStudy,
  singleSample,
  smallSampleSizes,
} from "@/lib/sampling/design-study";
import {
  runUniformityStudy,
  validateCensus,
  validateGenerated,
} from "@/lib/sampling/spatial-checks";
import { getSuburbs } from "./data";

/** The SAL boundaries, read once from public/ (synchronous I/O, so it is prerendered). */
function loadBoundaries(): FeatureCollection<Polygon | MultiPolygon, SalProperties> {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "data", "sal-sa.geojson"), "utf8"),
  ) as FeatureCollection<Polygon | MultiPolygon, SalProperties>;
}

function computeSamplingEvidence() {
  const rows = getSuburbs().rows;
  const fc = loadBoundaries();
  const index = new GeometryIndex(fc);
  return {
    designs: runDesignStudy(rows, { n: 1000, replicates: 200, firstSeed: 1 }),
    examples: {
      uniform: singleSample(rows, "uniform", 2000, 2025),
      weighted: singleSample(rows, "weighted", 2000, 2025),
      small: singleSample(rows, "weighted", 30, 2025),
    },
    smallSizes: smallSampleSizes([10, 20, 30, 40]),
    validation: [
      validateGenerated(rows, index, { count: 5000, seed: 2025, mode: "uniform" }),
      validateGenerated(rows, index, { count: 5000, seed: 2025, mode: "population" }),
      validateCensus(rows, index, { perSuburb: 5, seed: 2025 }),
    ],
    uniformity: runUniformityStudy(rows, index, fc, {
      pointsPerSuburb: 200,
      replicates: 100,
      headlineSeed: 2025,
      firstSeed: 1,
    }),
  };
}

export type SamplingEvidence = ReturnType<typeof computeSamplingEvidence>;

let evidence: SamplingEvidence | null = null;

/**
 * Every number on /sampling, computed with the real generator from fixed
 * seeds (a few seconds). Synchronous I/O and pure computation, so Next.js
 * prerenders the page once at build time and it is fully static; the memo only
 * spares `next dev` from recomputing on every request. Same code, same seeds,
 * same numbers on every build.
 */
export function getSamplingEvidence(): SamplingEvidence {
  evidence ??= computeSamplingEvidence();
  return evidence;
}
