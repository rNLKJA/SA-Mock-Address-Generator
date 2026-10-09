/// <reference lib="webworker" />
/**
 * Runs the revived generator off the main thread. Loads the suburb table once,
 * and the boundary GeoJSON only when coordinates are requested.
 */
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { GeometryIndex, type SalProperties } from "@/lib/geo";
import {
  generateMockAddresses,
  type GenerateOptions,
  type GenerateResult,
} from "@/lib/generator/generate";
import type { SuburbsJson } from "@/lib/suburbs";

export interface WorkerRequest {
  id: number;
  options: GenerateOptions;
}

export type WorkerResponse =
  | { id: number; ok: true; result: GenerateResult; ms: number }
  | { id: number; ok: false; error: string };

let suburbs: Promise<SuburbsJson> | null = null;
let geometry: Promise<GeometryIndex> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

function loadSuburbs() {
  suburbs ??= fetchJson<SuburbsJson>("/data/suburbs.json").catch((e) => {
    suburbs = null;
    throw e;
  });
  return suburbs;
}

function loadGeometry() {
  geometry ??= fetchJson<FeatureCollection<Polygon | MultiPolygon, SalProperties>>(
    "/data/sal-sa.geojson",
  )
    .then((fc) => new GeometryIndex(fc))
    .catch((e) => {
      geometry = null;
      throw e;
    });
  return geometry;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, options } = event.data;
  try {
    const [table, index] = await Promise.all([
      loadSuburbs(),
      options.coordinates ? loadGeometry() : Promise.resolve(null),
    ]);
    const start = performance.now();
    const result = generateMockAddresses(table.rows, index, options);
    const response: WorkerResponse = {
      id,
      ok: true,
      result,
      ms: performance.now() - start,
    };
    ctx.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Generation failed.",
    };
    ctx.postMessage(response);
  }
};
