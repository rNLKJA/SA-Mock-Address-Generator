"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, MousePointerClick, Search } from "lucide-react";
import { SuburbCard } from "@/components/common/suburb-card";
import { SaMap, type MapFocus } from "@/components/map/sa-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuburbData } from "@/hooks/use-suburb-data";
import { ADELAIDE_GPO, haversineKm, type LonLat } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/photon";
import { cn, formatInt } from "@/lib/utils";

const EXAMPLES = [
  "North Terrace, Adelaide",
  "Glenelg Jetty",
  "Coober Pedy",
  "Penola",
  "Port Lincoln Marina",
];

interface Selection {
  lonLat: LonLat;
  label: string;
  detail: string;
  photonPostcode: string | null;
  photonLocality: string | null;
  source: "search" | "map";
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: GeocodeResult[]; query: string }
  | { status: "error"; message: string };

export function LookupApp() {
  const id = useId();
  const { data, error: dataError } = useSuburbData(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selection, setSelection] = useState<Selection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSearched = useRef("");

  const runSearch = async (q: string) => {
    const trimmed = q.trim();
    lastSearched.current = trimmed;
    if (trimmed.length < 3) {
      setSearch({ status: "error", message: "Type at least 3 characters." });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearch({ status: "loading" });
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const body = (await res.json()) as { results?: GeocodeResult[]; error?: string };
      if (!res.ok || !body.results)
        throw new Error(body.error ?? `Search failed (HTTP ${res.status}).`);
      setSearch({ status: "done", results: body.results, query: trimmed });
    } catch (e) {
      if (controller.signal.aborted) return;
      setSearch({
        status: "error",
        message: e instanceof Error ? e.message : "Search failed.",
      });
    }
  };

  // Debounced type-ahead (min 4 characters) to keep requests to Photon polite.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 4 || q === lastSearched.current) return;
    const t = window.setTimeout(() => void runSearch(q), 550);
    return () => window.clearTimeout(t);
  }, [query]);

  const match = useMemo(() => {
    if (!selection || !data?.index) return null;
    const code = data.index.locate(selection.lonLat);
    if (code) return { suburb: data.byCode.get(code) ?? null, offshoreKm: null };
    const near = data.index.nearest(selection.lonLat, 2);
    return near
      ? { suburb: data.byCode.get(near.code) ?? null, offshoreKm: near.km }
      : null;
  }, [selection, data]);
  const located = match?.suburb ?? null;

  const focus: MapFocus | null = useMemo(() => {
    if (!selection) return null;
    const key = `${selection.lonLat.join(",")}:${located?.code ?? ""}`;
    const bbox = located && data?.index?.bbox(located.code);
    return bbox ? { key, bbox } : { key, center: selection.lonLat, zoom: 11 };
  }, [selection, located, data]);

  const choose = (r: GeocodeResult) =>
    setSelection({
      lonLat: r.lonLat,
      label: r.label,
      detail: r.detail,
      photonPostcode: r.photonPostcode,
      photonLocality: r.photonLocality,
      source: "search",
    });

  const distance = selection ? haversineKm(ADELAIDE_GPO, selection.lonLat) : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="space-y-3 rounded-xl border bg-card p-4"
        >
          <label htmlFor={`${id}-q`} className="text-sm font-medium">
            Search a real South Australian place or address
          </label>
          <div className="flex gap-2">
            <Input
              id={`${id}-q`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 25 Grenfell Street, Adelaide"
              autoComplete="off"
              aria-describedby={`${id}-hint`}
              className="h-9"
            />
            <Button type="submit" size="lg" aria-label="Search">
              {search.status === "loading" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Search aria-hidden />
              )}
            </Button>
          </div>
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Searches go through this site&apos;s server to{" "}
            <a className="underline underline-offset-2" href="https://photon.komoot.io">
              Photon
            </a>{" "}
            (OpenStreetMap data), limited to South Australia and cached. Nothing is
            stored.
          </p>
          <div className="flex flex-wrap gap-1.5" aria-label="Example searches">
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => {
                  setQuery(ex);
                  void runSearch(ex);
                }}
              >
                {ex}
              </Button>
            ))}
          </div>
        </form>

        <div aria-live="polite" className="space-y-2">
          {search.status === "error" && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/[0.06] px-3 py-2 text-sm"
            >
              {search.message}
            </p>
          )}
          {search.status === "done" && search.results.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
              No South Australian match for &ldquo;{search.query}&rdquo;. Try a suburb or
              a street name, or click the map.
            </p>
          )}
          {search.status === "done" && search.results.length > 0 && (
            <ul className="space-y-1.5" aria-label="Search results">
              {search.results.map((r) => {
                const active =
                  selection?.source === "search" &&
                  selection.lonLat.join() === r.lonLat.join();
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => choose(r)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60",
                        active && "border-primary/60 bg-primary/[0.06]",
                      )}
                    >
                      <MapPin
                        className="mt-0.5 size-4 shrink-0 text-sa-red"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {r.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.detail} · {r.kind.replace(/_/g, " ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selection && (
          <section aria-label="Lookup result" className="space-y-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="eyebrow mb-1">
                {selection.source === "map" ? "Dropped pin" : "Photon result"}
              </p>
              <p className="font-medium">{selection.label}</p>
              {selection.detail && (
                <p className="text-sm text-muted-foreground">{selection.detail}</p>
              )}
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {selection.lonLat[1].toFixed(5)}, {selection.lonLat[0].toFixed(5)}
                {distance !== null &&
                  ` · ${formatInt(Math.round(distance))} km from the Adelaide GPO`}
              </p>
            </div>
            {!data && !dataError && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading suburb
                boundaries…
              </p>
            )}
            {dataError && <p className="text-sm text-destructive">{dataError}</p>}
            {data && located && (
              <SuburbCard suburb={located}>
                <p className="mb-2 text-xs text-muted-foreground">
                  {match?.offshoreKm != null
                    ? `The point sits just outside the simplified coastline, so this is the nearest suburb (${Math.max(10, Math.round(match.offshoreKm * 1000))} m away).`
                    : "Point-in-polygon against the ABS 2021 boundaries, computed in your browser."}
                  {selection.photonPostcode &&
                    selection.photonPostcode !== located.postcode && (
                      <>
                        {" "}
                        Photon reports postcode {selection.photonPostcode}; the ABS Postal
                        Area for most residents here is {located.postcode}.
                      </>
                    )}
                </p>
              </SuburbCard>
            )}
            {data && !located && (
              <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                This point is more than 2 km from every South Australian suburb boundary
                (offshore or interstate).
              </p>
            )}
          </section>
        )}
      </div>

      <div className="space-y-2">
        <div className="h-[26rem] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <SaMap
            label="Map of South Australia. Click anywhere to look up the suburb at that point."
            marker={selection?.lonLat ?? null}
            highlightCode={located?.code ?? null}
            focus={focus}
            onMapClick={(lonLat) =>
              setSelection({
                lonLat,
                label: "Map click",
                detail: "",
                photonPostcode: null,
                photonLocality: null,
                source: "map",
              })
            }
          />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick className="size-3.5" aria-hidden /> Click the map to look up
          any point, even if the geocoder is offline.
        </p>
      </div>
    </div>
  );
}
