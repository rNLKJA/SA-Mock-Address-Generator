/**
 * Photon (https://photon.komoot.io) geocoding: request building and response
 * validation. Photon is free, keyless and backed by OpenStreetMap data.
 */
import { z } from "zod";
import { SA_BBOX, inBBox, type LonLat } from "@/lib/geo";

export const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
export const USER_AGENT =
  "SA-Mock-Address-Lab/1.0 (+https://github.com/rNLKJA/SA-Mock-Address-Generator)";

export const geocodeQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3, "Type at least 3 characters.")
    .max(200, "Keep the search under 200 characters."),
  limit: z.coerce.number().int().min(1).max(8).default(6),
});

const photonFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z
    .object({
      osm_type: z.string().optional(),
      osm_id: z.number().optional(),
      osm_key: z.string().optional(),
      osm_value: z.string().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      housenumber: z.string().optional(),
      street: z.string().optional(),
      locality: z.string().optional(),
      district: z.string().optional(),
      city: z.string().optional(),
      county: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
      countrycode: z.string().optional(),
    })
    .passthrough(),
});

export const photonResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(photonFeatureSchema),
});

export type PhotonResponse = z.infer<typeof photonResponseSchema>;

export interface GeocodeResult {
  id: string;
  label: string;
  detail: string;
  kind: string;
  lonLat: LonLat;
  photonPostcode: string | null;
  photonLocality: string | null;
}

export function buildPhotonUrl(q: string, limit: number): string {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lang: "en",
    bbox: SA_BBOX.join(","),
  });
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

/** Keep South Australian hits and turn them into display-ready rows. */
export function normalisePhoton(response: PhotonResponse): GeocodeResult[] {
  const out: GeocodeResult[] = [];
  const seen = new Set<string>();
  for (const f of response.features) {
    const p = f.properties;
    const lonLat: LonLat = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    const inSa = p.state ? p.state === "South Australia" : inBBox(lonLat, SA_BBOX);
    if (!inSa || (p.countrycode && p.countrycode !== "AU")) continue;
    const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
    const label = p.name ?? (streetLine || p.district || p.city || "Unnamed place");
    const locality = p.district ?? p.locality ?? p.city ?? null;
    const detail = [
      p.name && streetLine && streetLine !== p.name ? streetLine : null,
      locality,
      p.postcode,
    ]
      .filter(Boolean)
      .join(", ");
    const id = `${p.osm_type ?? "X"}${p.osm_id ?? `${lonLat[0]},${lonLat[1]}`}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      detail: detail || "South Australia",
      kind: p.osm_value ?? p.type ?? "place",
      lonLat,
      photonPostcode: p.postcode ?? null,
      photonLocality: locality,
    });
  }
  return out;
}
