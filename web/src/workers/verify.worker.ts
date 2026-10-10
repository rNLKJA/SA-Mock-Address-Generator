/// <reference lib="webworker" />
/**
 * Runs the Verification Lab off the main thread: loads the suburb table and
 * the SAL boundaries once, regenerates the set (or parses a CSV) and runs
 * every record- and set-level check.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GenerateOptions } from "@/lib/generator/generate";
import { GeometryIndex, type SalProperties } from "@/lib/geo";
import type { SuburbsJson } from "@/lib/suburbs";
import type { VerificationResult } from "@/lib/verification/types";
import {
  verifyContext,
  verifyCsv,
  verifyHandoff,
  type CsvVerifyOptions,
  type VerifyContext,
} from "@/lib/verification/verify";

export type VerifyWorkerRequest =
  | { id: number; kind: "handoff"; options: GenerateOptions }
  | { id: number; kind: "csv"; csv: string; options: CsvVerifyOptions };

export type VerifyWorkerResponse =
  | { id: number; ok: true; result: VerificationResult }
  | { id: number; ok: false; error: string };

let context: Promise<VerifyContext> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

function loadContext(): Promise<VerifyContext> {
  context ??= Promise.all([
    fetchJson<SuburbsJson>("/data/suburbs.json"),
    fetchJson<FeatureCollection<Polygon | MultiPolygon, SalProperties>>(
      "/data/sal-sa.geojson",
    ),
  ])
    .then(([table, fc]) => verifyContext(table.rows, new GeometryIndex(fc)))
    .catch((e) => {
      context = null;
      throw e;
    });
  return context;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<VerifyWorkerRequest>) => {
  const request = event.data;
  try {
    const data = await loadContext();
    const result =
      request.kind === "handoff"
        ? await verifyHandoff(data, request.options)
        : await verifyCsv(data, request.csv, request.options);
    const response: VerifyWorkerResponse = { id: request.id, ok: true, result };
    ctx.postMessage(response);
  } catch (error) {
    const response: VerifyWorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed.",
    };
    ctx.postMessage(response);
  }
};
