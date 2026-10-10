"use client";

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeocodeResult } from "@/lib/photon";
import { cn, formatInt } from "@/lib/utils";

interface SpotCheckProps {
  /** Sample of addresses to check (typically 5-10 from a larger set). */
  addresses: Array<{
    id: number;
    full_address: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

interface CheckResult {
  id: number;
  address: string;
  status: "pending" | "searching" | "found" | "not-found" | "error";
  geocoded: GeocodeResult | null;
  distance: number | null;
  error: string | null;
}

/**
 * Calculate distance between two points using the Haversine formula.
 * Returns distance in kilometres.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Optional geocode spot check: verify a sample of generated addresses against
 * real geocoding results to check coordinate quality.
 */
export function SpotCheck({ addresses }: SpotCheckProps) {
  const [results, setResults] = useState<CheckResult[]>(
    addresses.map((a) => ({
      id: a.id,
      address: a.full_address,
      status: "pending",
      geocoded: null,
      distance: null,
      error: null,
    })),
  );
  const [busy, setBusy] = useState(false);

  const checkAddress = useCallback(
    async (index: number) => {
      const address = addresses[index];
      if (!address) return;

      setResults((prev) =>
        prev.map((r, i) => (i === index ? { ...r, status: "searching" } : r)),
      );

      try {
        const res = await fetch(
          `/api/geocode?${new URLSearchParams({
            q: address.full_address,
            limit: "1",
          })}`,
        );

        if (!res.ok) {
          const { error } = (await res.json()) as { error?: string };
          setResults((prev) =>
            prev.map((r, i) =>
              i === index
                ? {
                    ...r,
                    status: "error",
                    error: error ?? `HTTP ${res.status}`,
                  }
                : r,
            ),
          );
          return;
        }

        const data = (await res.json()) as {
          results: GeocodeResult[];
        };

        if (data.results.length === 0) {
          setResults((prev) =>
            prev.map((r, i) =>
              i === index ? { ...r, status: "not-found", error: null } : r,
            ),
          );
          return;
        }

        const geocoded = data.results[0];
        const distance =
          address.latitude !== null && address.longitude !== null
            ? haversineDistance(
                address.latitude,
                address.longitude,
                geocoded.lonLat[1],
                geocoded.lonLat[0],
              )
            : null;

        setResults((prev) =>
          prev.map((r, i) =>
            i === index ? { ...r, status: "found", geocoded, distance, error: null } : r,
          ),
        );
      } catch (e) {
        setResults((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  status: "error",
                  error: e instanceof Error ? e.message : "Network error",
                }
              : r,
          ),
        );
      }
    },
    [addresses],
  );

  const checkAll = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < addresses.length; i++) {
        await checkAddress(i);
        // Rate limiting: wait 1 second between requests
        if (i < addresses.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResults(
      addresses.map((a) => ({
        id: a.id,
        address: a.full_address,
        status: "pending",
        geocoded: null,
        distance: null,
        error: null,
      })),
    );
  };

  const checkedCount = results.filter((r) => r.status !== "pending").length;
  const foundCount = results.filter((r) => r.status === "found").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold">Geocode Spot Check</h3>
          <p className="text-sm text-muted-foreground">
            Verify {addresses.length} sample{" "}
            {addresses.length === 1 ? "address" : "addresses"} against real geocoding to
            check coordinate quality.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={busy || checkedCount === 0}
          >
            <X aria-hidden /> Reset
          </Button>
          <Button size="sm" onClick={checkAll} disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Search aria-hidden />
            )}
            {busy ? "Checking…" : "Check all"}
          </Button>
        </div>
      </div>

      {checkedCount > 0 && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <p>
            <strong className="font-medium">
              {formatInt(checkedCount)} of {formatInt(addresses.length)}
            </strong>{" "}
            checked · <strong className="font-medium">{formatInt(foundCount)}</strong>{" "}
            found
          </p>
        </div>
      )}

      <div className="space-y-2">
        {results.map((result, i) => (
          <div
            key={result.id}
            className={cn(
              "rounded-lg border p-3 transition-colors",
              result.status === "found" && "border-green-600/40 bg-green-600/[0.04]",
              result.status === "not-found" && "border-amber-600/40 bg-amber-600/[0.04]",
              result.status === "error" && "border-destructive/40 bg-destructive/[0.04]",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                #{result.id}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{result.address}</p>
                  {result.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => checkAddress(i)}
                      disabled={busy}
                      aria-label={`Check address ${result.id}`}
                    >
                      <Search className="size-3.5" aria-hidden />
                      Check
                    </Button>
                  )}
                </div>

                {result.status === "searching" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Searching via Photon…
                  </div>
                )}

                {result.status === "found" && result.geocoded && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-500">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      Found
                    </div>
                    <div className="rounded-md bg-background/60 px-2 py-1.5 text-xs">
                      <p className="font-medium">{result.geocoded.label}</p>
                      <p className="text-muted-foreground">{result.geocoded.detail}</p>
                      {result.distance !== null && (
                        <p className="mt-1 font-mono text-muted-foreground">
                          Distance: {result.distance.toFixed(2)} km
                          {result.distance > 10 && (
                            <span className="ml-1 text-amber-700 dark:text-sa-gold">
                              (large)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {result.status === "not-found" && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-sa-gold">
                    <MapPin className="size-3.5" aria-hidden />
                    No geocoding results found
                  </div>
                )}

                {result.status === "error" && result.error && (
                  <div className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                    <span>{result.error}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">How it works:</strong> Each mock
          address is searched via Photon (OpenStreetMap). The geocoded coordinates are
          compared with the generated ones to check they&rsquo;re in a reasonable range.
          Large distances suggest the mock suburb might not match real boundaries, or the
          generated coordinates fell outside the expected area.
        </p>
        <p className="mt-2">
          <strong className="font-medium text-foreground">Rate limiting:</strong> Requests
          are spaced 1 second apart to respect the geocoding service.
        </p>
      </div>
    </div>
  );
}
