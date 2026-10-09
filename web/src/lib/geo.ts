/**
 * Small, dependency-free geometry helpers: point-in-polygon, a bounding-box
 * index over the SAL boundaries, seeded rejection sampling and haversine.
 */
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

export type LonLat = [number, number];
export type BBox = [number, number, number, number];

/** South Australia, generously: [minLon, minLat, maxLon, maxLat]. */
export const SA_BBOX: BBox = [128.9, -38.2, 141.1, -25.9];
/** Adelaide GPO, the usual reference point for "distance from the city". */
export const ADELAIDE_GPO: LonLat = [138.5999, -34.9255];

export interface RandomSource {
  random(): number;
}

/** Even-odd ray casting; points exactly on an edge may fall either way. */
export function pointInRing(point: LonLat, ring: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: LonLat, rings: Position[][]): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) if (pointInRing(point, rings[h])) return false;
  return true;
}

export function pointInGeometry(
  point: LonLat,
  geometry: Polygon | MultiPolygon,
): boolean {
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  return geometry.coordinates.some((poly) => pointInPolygon(point, poly));
}

export function bboxOf(geometry: Polygon | MultiPolygon): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

export function inBBox([x, y]: LonLat, [minX, minY, maxX, maxY]: BBox): boolean {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface SalProperties {
  c: string;
  n?: string;
  ra?: number;
  d?: number | null;
  o?: number | null;
}

interface IndexEntry {
  code: string;
  geometry: Polygon | MultiPolygon;
  bbox: BBox;
}

/** Bounding-box prefiltered lookups over the simplified SAL polygons. */
export class GeometryIndex {
  private readonly entries: IndexEntry[];
  private readonly byCode = new Map<string, IndexEntry>();

  constructor(collection: FeatureCollection<Polygon | MultiPolygon, SalProperties>) {
    this.entries = collection.features
      .filter((f): f is Feature<Polygon | MultiPolygon, SalProperties> =>
        Boolean(f.geometry),
      )
      .map((f) => ({
        code: String(f.properties.c),
        geometry: f.geometry,
        bbox: bboxOf(f.geometry),
      }));
    for (const e of this.entries) this.byCode.set(e.code, e);
  }

  get size(): number {
    return this.entries.length;
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  bbox(code: string): BBox | null {
    return this.byCode.get(code)?.bbox ?? null;
  }

  /** SAL code containing the point, or null (offshore, interstate). */
  locate(point: LonLat): string | null {
    for (const e of this.entries) {
      if (inBBox(point, e.bbox) && pointInGeometry(point, e.geometry)) return e.code;
    }
    return null;
  }

  /**
   * Nearest suburb boundary within `maxKm` of a point that is in no suburb
   * (jetties, marinas, beaches cut by the simplified coastline).
   */
  nearest(point: LonLat, maxKm = 2): { code: string; km: number } | null {
    const pad = maxKm / 80; // degrees, generous at SA latitudes
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos((point[1] * Math.PI) / 180);
    let best: { code: string; km: number } | null = null;
    for (const e of this.entries) {
      const [minX, minY, maxX, maxY] = e.bbox;
      if (
        point[0] < minX - pad ||
        point[0] > maxX + pad ||
        point[1] < minY - pad ||
        point[1] > maxY + pad
      ) {
        continue;
      }
      const polys =
        e.geometry.type === "Polygon" ? [e.geometry.coordinates] : e.geometry.coordinates;
      for (const poly of polys) {
        for (const ring of poly) {
          for (let i = 1; i < ring.length; i++) {
            const ax = (ring[i - 1][0] - point[0]) * kmPerDegLon;
            const ay = (ring[i - 1][1] - point[1]) * kmPerDegLat;
            const bx = (ring[i][0] - point[0]) * kmPerDegLon;
            const by = (ring[i][1] - point[1]) * kmPerDegLat;
            const dx = bx - ax;
            const dy = by - ay;
            const len2 = dx * dx + dy * dy;
            const t =
              len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
            const km = Math.hypot(ax + t * dx, ay + t * dy);
            if (km <= maxKm && (!best || km < best.km)) best = { code: e.code, km };
          }
        }
      }
    }
    return best;
  }

  /**
   * Seeded rejection sampling inside the suburb boundary. Returns null if no
   * point is accepted within `maxTries` (callers fall back to a label point).
   *
   * `round` is applied before the inside test, so a point that is published
   * rounded (the generator keeps 6 decimal places) is accepted only if the
   * rounded point is still inside. Without it, a point a few centimetres from
   * the boundary can round across it into the neighbouring suburb: the
   * spatial validation on /sampling found one such point in 5,000.
   */
  samplePoint(
    code: string,
    rng: RandomSource,
    maxTries = 2000,
    round?: (p: LonLat) => LonLat,
  ): LonLat | null {
    const e = this.byCode.get(code);
    if (!e) return null;
    const [minX, minY, maxX, maxY] = e.bbox;
    for (let t = 0; t < maxTries; t++) {
      const raw: LonLat = [
        minX + rng.random() * (maxX - minX),
        minY + rng.random() * (maxY - minY),
      ];
      const p = round ? round(raw) : raw;
      if (pointInGeometry(p, e.geometry)) return p;
    }
    return null;
  }
}
