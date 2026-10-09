import { cacheLife } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  USER_AGENT,
  buildPhotonUrl,
  geocodeQuerySchema,
  normalisePhoton,
  photonResponseSchema,
  type GeocodeResult,
} from "@/lib/photon";
import { allowRequest } from "@/lib/server/rate-limit";

/** Cached per normalised query for a day, so repeat searches never reach Photon. */
async function searchPhoton(q: string, limit: number): Promise<GeocodeResult[]> {
  "use cache";
  cacheLife("days");
  const res = await fetch(buildPhotonUrl(q, limit), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Photon responded with HTTP ${res.status}`);
  return normalisePhoton(photonResponseSchema.parse(await res.json()));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
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

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { error: "Too many searches in a minute. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const query = parsed.data.q.replace(/\s+/g, " ").toLowerCase();
  try {
    const results = await searchPhoton(query, parsed.data.limit);
    return NextResponse.json(
      { query: parsed.data.q, results, source: "photon.komoot.io" },
      {
        headers: {
          "Cache-Control":
            "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    console.error("[geocode]", error);
    return NextResponse.json(
      {
        error:
          "The geocoder is not responding right now. You can still click the map to look up a point.",
      },
      { status: 502 },
    );
  }
}
