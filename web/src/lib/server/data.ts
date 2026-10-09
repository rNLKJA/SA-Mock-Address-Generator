import "server-only";
import provenanceJson from "../../../public/data/provenance.json";
import suburbsJson from "../../../public/data/suburbs.json";
import type { SuburbsJson } from "@/lib/suburbs";

export type Provenance = typeof provenanceJson;

export function getSuburbs(): SuburbsJson {
  return suburbsJson as SuburbsJson;
}

export function getProvenance(): Provenance {
  return provenanceJson;
}

export interface FilterOptions {
  suburbs: string[];
  councils: { name: string; count: number }[];
  raCounts: number[];
  decileCounts: number[];
  noDecile: number;
  total: number;
}

/** Small lists the client-side forms need; the full table stays out of the RSC payload. */
export function getFilterOptions(): FilterOptions {
  const rows = getSuburbs().rows.filter((r) => r.addressable);
  const councils = new Map<string, number>();
  const raCounts = [0, 0, 0, 0, 0];
  const decileCounts = Array(10).fill(0) as number[];
  let noDecile = 0;
  for (const r of rows) {
    councils.set(r.council, (councils.get(r.council) ?? 0) + 1);
    raCounts[r.ra]++;
    if (r.decileSa === null) noDecile++;
    else decileCounts[r.decileSa - 1]++;
  }
  return {
    suburbs: rows.map((r) => r.name).sort(),
    councils: Array.from(councils, ([name, count]) => ({ name, count })).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    raCounts,
    decileCounts,
    noDecile,
    total: rows.length,
  };
}
