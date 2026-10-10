"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Info, Loader2, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haversineKm } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/photon";
import { cn, formatInt } from "@/lib/utils";
import {
  SPOT_CHECK_COOLDOWN_MS,
  SPOT_CHECK_GAP_MS,
  SPOT_CHECK_MAX,
  compareSpot,
  spotCheckWait,
  summariseSpots,
  type SpotOutcome,
} from "@/lib/verification/spot-check";
import type { SpotPoint } from "@/lib/verification/types";

type Row =
  | { state: "waiting" }
  | { state: "asking" }
  | { state: "done"; outcome: SpotOutcome; hit: GeocodeResult | null; km: number | null }
  | { state: "error"; error: string };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

function Agreement({ value, label }: { value: boolean | null; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[0.7rem]",
        value === true && "border-emerald-700/30 text-emerald-800 dark:text-emerald-300",
        value === false && "border-sa-gold/50 text-amber-900 dark:text-sa-gold",
        value === null && "text-muted-foreground",
      )}
    >
      {label} {value === true ? "agrees" : value === false ? "differs" : "no answer"}
    </span>
  );
}

/**
 * The optional live spot check: reverse-geocode up to 10 sampled points
 * through the site's /api/geocode Photon proxy, one request every 1.1 s and
 * at most one run a minute, and compare the suburb and postcode.
 */
export function SpotCheck({ points }: { points: SpotPoint[] }) {
  const sample = points.slice(0, SPOT_CHECK_MAX);
  const [rows, setRows] = useState<Row[]>(() => sample.map(() => ({ state: "waiting" })));
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Tick once a second while the cool-down runs, for the countdown.
  const wait = spotCheckWait(startedAt, now);
  useEffect(() => {
    if (startedAt === null || spotCheckWait(startedAt, Date.now()) === 0) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (spotCheckWait(startedAt, n) === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt, running]);

  const run = async () => {
    if (running || spotCheckWait(startedAt, Date.now()) > 0) return;
    const controller = new AbortController();
    abort.current = controller;
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    setRunning(true);
    setStopped(null);
    setRows(sample.map(() => ({ state: "waiting" })));
    const set = (i: number, row: Row) =>
      setRows((prev) => prev.map((r, k) => (k === i ? row : r)));
    try {
      for (let i = 0; i < sample.length; i++) {
        if (controller.signal.aborted) return;
        if (i > 0) await sleep(SPOT_CHECK_GAP_MS, controller.signal);
        const p = sample[i];
        set(i, { state: "asking" });
        try {
          const res = await fetch(
            `/api/geocode?${new URLSearchParams({ lat: String(p.latitude), lon: String(p.longitude) })}`,
            { signal: controller.signal },
          );
          const body = (await res.json().catch(() => ({}))) as {
            results?: GeocodeResult[];
            error?: string;
          };
          if (res.status === 429) {
            set(i, { state: "error", error: body.error ?? "Too many requests." });
            setStopped(
              "The geocoder proxy's rate limit was reached, so the spot check stopped. Try again in a minute.",
            );
            return;
          }
          if (!res.ok) {
            set(i, { state: "error", error: body.error ?? `HTTP ${res.status}` });
            continue;
          }
          const hit = body.results?.[0] ?? null;
          set(i, {
            state: "done",
            outcome: compareSpot(p, hit),
            hit,
            km: hit ? haversineKm([p.longitude, p.latitude], hit.lonLat) : null,
          });
        } catch (e) {
          if (controller.signal.aborted) return;
          set(i, {
            state: "error",
            error: e instanceof Error ? e.message : "The request failed.",
          });
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false);
        setNow(Date.now());
      }
    }
  };

  const summary = summariseSpots(
    rows.map((r) => (r.state === "done" ? r.outcome : null)),
  );
  const asked = rows.filter((r) => r.state === "done" || r.state === "error").length;

  if (sample.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This set has no coordinates, so there are no points to reverse-geocode.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="spot-check">
      <p className="flex gap-2.5 rounded-lg border border-sa-red/30 bg-sa-red/[0.05] px-3.5 py-3 text-sm text-ink-soft">
        <Info className="mt-0.5 size-4 shrink-0 text-sa-red" aria-hidden />
        <span>
          These addresses are synthetic: the street number and name are random, so a
          street-level match is not expected and is not compared. Each point is
          reverse-geocoded with Photon (OpenStreetMap) and only the suburb and postcode it
          returns are compared. OSM suburbs and postcodes do not always follow ABS
          boundaries, so a few differences near borders are normal.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={running || wait > 0}>
          {running ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <MapPinned aria-hidden />
          )}
          {running
            ? `Checking ${formatInt(Math.min(asked + 1, sample.length))} of ${formatInt(sample.length)}…`
            : `Reverse-geocode ${formatInt(sample.length)} ${sample.length === 1 ? "point" : "points"}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {wait > 0 && !running
            ? `Next run in ${Math.ceil(wait / 1000)} s (one run a minute).`
            : `One request every ${(SPOT_CHECK_GAP_MS / 1000).toFixed(1)} s, at most ${SPOT_CHECK_MAX} per run and one run every ${SPOT_CHECK_COOLDOWN_MS / 60_000} minute, through this site's /api/geocode proxy.`}
        </p>
      </div>

      {asked > 0 && (
        <p className="text-sm" aria-live="polite" data-testid="spot-check-summary">
          <strong className="font-medium">
            Suburb agrees for {formatInt(summary.suburbAgree)} of{" "}
            {formatInt(summary.suburbAsked)}, postcode for{" "}
            {formatInt(summary.postcodeAgree)} of {formatInt(summary.postcodeAsked)}
          </strong>{" "}
          <span className="text-muted-foreground">
            ({formatInt(summary.answered)} of {formatInt(asked)} points answered so far).
          </span>
        </p>
      )}
      {stopped && (
        <p role="alert" className="flex gap-2 text-sm text-amber-900 dark:text-sa-gold">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {stopped}
        </p>
      )}

      <ul
        className="divide-y rounded-xl border bg-card text-sm"
        aria-label="Spot-checked points"
      >
        {sample.map((p, i) => {
          const r = rows[i];
          return (
            <li
              key={p.id}
              className="space-y-1.5 px-3.5 py-2.5"
              data-spot-state={r.state}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 break-words">
                  <span className="font-mono text-xs text-muted-foreground">#{p.id}</span>{" "}
                  {p.full_address}
                </span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                </span>
              </div>
              {r.state === "waiting" && (
                <p className="text-xs text-muted-foreground">Not asked yet.</p>
              )}
              {r.state === "asking" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Asking Photon…
                </p>
              )}
              {r.state === "error" && (
                <p className="text-xs text-destructive">{r.error}</p>
              )}
              {r.state === "done" && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Agreement value={r.outcome.suburbAgrees} label="Suburb" />
                  <Agreement value={r.outcome.postcodeAgrees} label="Postcode" />
                  <span className="text-muted-foreground">
                    {r.hit
                      ? `Photon: ${r.outcome.places.join(", ") || "no place name"}${r.outcome.postcode ? ` ${r.outcome.postcode}` : ""}, nearest feature ${r.km !== null ? `${r.km.toFixed(2)} km` : ""} away`
                      : "Photon returned nothing for this point."}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
