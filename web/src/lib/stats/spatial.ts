/**
 * Point-pattern statistics for checking that mock coordinates are spread
 * uniformly inside a suburb: a local planar projection, polygon area and
 * perimeter, nearest-neighbour distances and the Clark-Evans ratio, with
 * Donnelly's edge correction.
 *
 * Clark & Evans (1954): under complete spatial randomness (CSR) with
 * intensity λ = n / A, the mean nearest-neighbour distance is 1 / (2√λ).
 * R = observed mean / expected mean: about 1 for a uniform pattern, below 1
 * for clustering, above 1 for regular spacing (2.0 for a square lattice).
 * Points near the boundary have their neighbours cut off, which inflates the
 * observed mean; Donnelly (1978) corrects the expectation and variance with
 * the perimeter P:
 *   E = 0.5 √(A/n) + (0.0514 + 0.041/√n) P/n
 *   Var = 0.0703 A/n² + 0.037 P √(A/n⁵)
 * Donnelly derived this for rectangles; for irregular suburbs it is an
 * approximation, which is why the lab also checks the test's calibration
 * across many seeds.
 */
import type { MultiPolygon, Polygon, Position } from "geojson";
import { normalTwoSidedP } from "./distributions";

/** Mean Earth radius in km (IUGG), the same as the haversine in lib/geo. */
export const EARTH_RADIUS_KM = 6371.0088;

export type XY = [number, number];

/** Equirectangular projection to km around a reference point (fine for suburb-sized areas). */
export function projector(lon0: number, lat0: number): (p: Position) => XY {
  const k = (EARTH_RADIUS_KM * Math.PI) / 180;
  const c = Math.cos((lat0 * Math.PI) / 180);
  return (p) => [(p[0] - lon0) * k * c, (p[1] - lat0) * k];
}

/** Inverse of `projector`: km offsets back to [lon, lat]. */
export function unprojector(lon0: number, lat0: number): (p: XY) => [number, number] {
  const k = (EARTH_RADIUS_KM * Math.PI) / 180;
  const c = Math.cos((lat0 * Math.PI) / 180);
  return ([x, y]) => [lon0 + x / (k * c), lat0 + y / k];
}

/** Signed shoelace area of a ring (positive when counter-clockwise). */
export function ringSignedArea(ring: readonly XY[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return s / 2;
}

/** Length of a ring, closing it if the last point is not the first. */
export function ringLength(ring: readonly XY[]): number {
  let s = 0;
  for (let i = 1; i < ring.length; i++) {
    s += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && (first[0] !== last[0] || first[1] !== last[1])) {
    s += Math.hypot(first[0] - last[0], first[1] - last[1]);
  }
  return s;
}

export interface PolygonMetrics {
  areaKm2: number;
  perimeterKm: number;
  /** Polsby-Popper compactness 4πA/P²: 1 for a circle, near 0 for a sliver. */
  compactness: number;
  parts: number;
  holes: number;
  /** Projection centre used for the metrics: [lon, lat]. */
  centre: [number, number];
}

/** Bounding-box centre of a polygon's outer rings. */
function bboxCentre(geometry: Polygon | MultiPolygon): [number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** Area (outer rings minus holes) and perimeter (every ring) in km. */
export function polygonMetrics(geometry: Polygon | MultiPolygon): PolygonMetrics {
  const centre = bboxCentre(geometry);
  const project = projector(centre[0], centre[1]);
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let area = 0;
  let perimeter = 0;
  let holes = 0;
  for (const poly of polys) {
    poly.forEach((ring, r) => {
      const xy = ring.map(project);
      const a = Math.abs(ringSignedArea(xy));
      area += r === 0 ? a : -a;
      if (r > 0) holes++;
      perimeter += ringLength(xy);
    });
  }
  return {
    areaKm2: area,
    perimeterKm: perimeter,
    compactness: perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0,
    parts: polys.length,
    holes,
    centre,
  };
}

/**
 * Distance from each point to its nearest other point. A uniform grid of
 * cells keeps this close to linear for the few hundred points used here.
 */
export function nearestNeighbourDistances(points: readonly XY[]): Float64Array {
  const n = points.length;
  const out = new Float64Array(n).fill(Infinity);
  if (n < 2) return out;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const w = Math.max(maxX - minX, 1e-12);
  const h = Math.max(maxY - minY, 1e-12);
  const side = Math.max(1, Math.ceil(Math.sqrt(n / 2)));
  const cell = Math.max(w, h) / side;
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const grid = new Map<number, number[]>();
  const cx = (x: number) => Math.min(cols - 1, Math.floor((x - minX) / cell));
  const cy = (y: number) => Math.min(rows - 1, Math.floor((y - minY) / cell));
  points.forEach(([x, y], i) => {
    const key = cy(y) * cols + cx(x);
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    const gx = cx(x);
    const gy = cy(y);
    let best = Infinity;
    // Grow the search ring until it cannot contain anything closer.
    for (let r = 0; r <= Math.max(cols, rows); r++) {
      for (let yy = gy - r; yy <= gy + r; yy++) {
        if (yy < 0 || yy >= rows) continue;
        for (let xx = gx - r; xx <= gx + r; xx++) {
          if (xx < 0 || xx >= cols) continue;
          if (Math.max(Math.abs(xx - gx), Math.abs(yy - gy)) !== r) continue;
          const bucket = grid.get(yy * cols + xx);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j === i) continue;
            const d = Math.hypot(points[j][0] - x, points[j][1] - y);
            if (d < best) best = d;
          }
        }
      }
      if (best <= r * cell) break;
    }
    out[i] = best;
  }
  return out;
}

export interface ClarkEvans {
  n: number;
  areaKm2: number;
  perimeterKm: number;
  /** Observed mean nearest-neighbour distance (km). */
  meanNn: number;
  /** CSR expectation without edge correction, 1 / (2√λ). */
  expectedNaive: number;
  rNaive: number;
  /** Donnelly edge-corrected expectation. */
  expected: number;
  /** Edge-corrected Clark-Evans ratio. */
  r: number;
  se: number;
  z: number;
  /** Two-sided p-value for H0: complete spatial randomness. */
  pValue: number;
}

/** Clark-Evans ratio with Donnelly's edge correction and its z-test. */
export function clarkEvans(
  points: readonly XY[],
  areaKm2: number,
  perimeterKm: number,
): ClarkEvans | null {
  const n = points.length;
  if (n < 2 || !(areaKm2 > 0)) return null;
  const nn = nearestNeighbourDistances(points);
  let sum = 0;
  for (const d of nn) sum += d;
  const meanNn = sum / n;
  const expectedNaive = 0.5 * Math.sqrt(areaKm2 / n);
  const expected = expectedNaive + ((0.0514 + 0.041 / Math.sqrt(n)) * perimeterKm) / n;
  const variance =
    (0.0703 * areaKm2) / (n * n) + 0.037 * perimeterKm * Math.sqrt(areaKm2 / n ** 5);
  const se = Math.sqrt(variance);
  const z = (meanNn - expected) / se;
  return {
    n,
    areaKm2,
    perimeterKm,
    meanNn,
    expectedNaive,
    rNaive: meanNn / expectedNaive,
    expected,
    r: meanNn / expected,
    se,
    z,
    pValue: normalTwoSidedP(z),
  };
}
