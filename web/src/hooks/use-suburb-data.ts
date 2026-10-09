"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { GeometryIndex, type SalProperties } from "@/lib/geo";
import type { OriginalTableJson } from "@/lib/original/lookup";
import type { Suburb, SuburbsJson } from "@/lib/suburbs";

export interface SuburbData {
  rows: Suburb[];
  byCode: Map<string, Suburb>;
  byName: Map<string, Suburb>;
  index: GeometryIndex | null;
}

// Module-level caches: each file is fetched at most once per page load.
let suburbsPromise: Promise<SuburbsJson> | null = null;
let geometryPromise: Promise<GeometryIndex> | null = null;
let originalPromise: Promise<OriginalTableJson> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

export function loadSuburbs(): Promise<SuburbsJson> {
  suburbsPromise ??= fetchJson<SuburbsJson>("/data/suburbs.json").catch((e) => {
    suburbsPromise = null;
    throw e;
  });
  return suburbsPromise;
}

export function loadGeometry(): Promise<GeometryIndex> {
  geometryPromise ??= fetchJson<FeatureCollection<Polygon | MultiPolygon, SalProperties>>(
    "/data/sal-sa.geojson",
  )
    .then((fc) => new GeometryIndex(fc))
    .catch((e) => {
      geometryPromise = null;
      throw e;
    });
  return geometryPromise;
}

export function fetchOriginalTable(): Promise<OriginalTableJson> {
  originalPromise ??= fetchJson<OriginalTableJson>("/data/original-suburbs.json").catch(
    (e) => {
      originalPromise = null;
      throw e;
    },
  );
  return originalPromise;
}

/** Loads the rebuilt suburb table (and optionally the boundary index) on the client. */
export function useSuburbData(withGeometry: boolean) {
  const [data, setData] = useState<SuburbData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadSuburbs(), withGeometry ? loadGeometry() : Promise.resolve(null)])
      .then(([table, index]) => {
        if (!alive) return;
        setData({
          rows: table.rows,
          byCode: new Map(table.rows.map((r) => [r.code, r])),
          byName: new Map(table.rows.map((r) => [r.name, r])),
          index,
        });
      })
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof Error ? e.message : "Could not load data."),
      );
    return () => {
      alive = false;
    };
  }, [withGeometry]);

  return { data, error };
}
