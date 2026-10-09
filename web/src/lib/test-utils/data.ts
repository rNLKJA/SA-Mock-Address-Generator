import { readFileSync } from "node:fs";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { SalProperties } from "@/lib/geo";
import type { SuburbsJson } from "@/lib/suburbs";

function readPublic<T>(file: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../public/data/${file}`, import.meta.url), "utf8"),
  ) as T;
}

export const suburbsJson = readPublic<SuburbsJson>("suburbs.json");
export const salGeojson =
  readPublic<FeatureCollection<Polygon | MultiPolygon, SalProperties>>("sal-sa.geojson");
