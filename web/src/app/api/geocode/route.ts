import { cacheLife } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  USER_AGENT,
  buildPhotonReverseUrl,
  buildPhotonUrl,
  geocodeQuerySchema,
  normalisePhoton,
  photonResponseSchema,
  reverseQuerySchema,
  type GeocodeResult,
} from "@/lib/photon";
import { allowRequest } from "@/lib/server/rate-limit";

async function fetchPhoton(url: string): Promise<GeocodeResult[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Photon responded with HTTP ${res.status}`);
  return normalisePhoton(photonResponseSchema.parse(await res.json()));
}

/** Cached per normalised query for a day, so repeat searches never reach Photon. */
async function searchPhoton(q: string, limit: number): Promise<GeocodeResult[]> {
  "use cache";
  cacheLife("days");
  return fetchPhoton(buildPhotonUrl(q, limit));
}

/** Cached per point (6 decimal places) for a day, like the forward search. */
async function reversePhoton(lon: number, lat: number): Promise<GeocodeResult[]> {
  "use cache";
  cacheLife("days");
  return fetchPhoton(buildPhotonReverseUrl(lon, lat));
}

const UNAVAILABLE =
  "The geocoder is not responding right now. You can still click the map to look up a point.";

function tooMany() {
  return NextResponse.json(
    { error: "Too many searches in a minute. Please wait a moment." },
    { status: 429, headers: { "Retry-After": "30" } },
  );
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
};

/**
 * GET /api/geocode?q=...      forward search (the lookup page)
 * GET /api/geocode?lat=&lon=  reverse geocode one point (the /verify spot check)
 *
 * Both share the per-IP rate limit and only ever return South Australian hits.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  if (params.has("lat") || params.has("lon")) {
    const parsed = reverseQuerySchema.safeParse({
      lat: params.get("lat") ?? "",
      lon: params.get("lon") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid point." },
        { status: 400 },
      );
    }
    if (!allowRequest(ip)) return tooMany();
    const lon = Math.round(parsed.data.lon * 1e6) / 1e6;
    const lat = Math.round(parsed.data.lat * 1e6) / 1e6;
    try {
      const results = await reversePhoton(lon, lat);
      return NextResponse.json(
        { query: { lat, lon }, results, source: "photon.komoot.io" },
        { headers: CACHE_HEADERS },
      );
    } catch (error) {
      console.error("[geocode:reverse]", error);
      return NextResponse.json({ error: UNAVAILABLE }, { status: 502 });
    }
  }

  const parsed = geocodeQuerySchema.safeParse({
    q: params.get("q") ?? "",
    limit: params.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid search." },
      { status: 400 },
    );
  }

  if (!allowRequest(ip)) return tooMany();

  const query = parsed.data.q.replace(/\s+/g, " ").toLowerCase();
  try {
    const results = await searchPhoton(query, parsed.data.limit);
    return NextResponse.json(
      { query: parsed.data.q, results, source: "photon.komoot.io" },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error("[geocode]", error);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 502 });
  }
}
