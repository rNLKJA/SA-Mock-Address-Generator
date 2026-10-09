/**
 * The point-in-polygon validation on /sampling reuses the sampler's own
 * ray-casting routine, so a bug in that routine could pass both. This test
 * checks the routine against Shapely (GEOS), which shares no code with it:
 * scripts/make_pip_reference.py records, for 3,000 seeded points, every SAL
 * polygon that contains each one, and GeometryIndex.locate must agree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GeometryIndex, type LonLat } from "@/lib/geo";
import { salGeojson } from "@/lib/test-utils/data";

type PipRecord = [number, number, string[]];

interface PipReference {
  geos: string;
  seed: number;
  summary: Record<
    "uniform" | "near_edge",
    { points: number; in_a_suburb: number; in_two_or_more: number }
  >;
  uniform: PipRecord[];
  near_edge: PipRecord[];
}

const reference = JSON.parse(
  readFileSync(new URL("../__fixtures__/pip-reference.json", import.meta.url), "utf8"),
) as PipReference;
const index = new GeometryIndex(salGeojson);

function disagreements(records: PipRecord[]) {
  return records.flatMap(([x, y, codes]) => {
    const p: LonLat = [x, y];
    const located = index.locate(p);
    const expected = codes.length === 1 ? codes[0] : null;
    return located === expected ? [] : [{ point: p, located, shapely: codes }];
  });
}

describe("point-in-polygon lookup agrees with Shapely (GEOS)", () => {
  it("uses the fixture this test expects (seed 2025, 1,500 + 1,500 points)", () => {
    expect(reference.seed).toBe(2025);
    expect(reference.uniform).toHaveLength(1500);
    expect(reference.near_edge).toHaveLength(1500);
    // No point lies in two polygons: the simplified boundaries do not overlap here.
    expect(reference.summary.uniform.in_two_or_more).toBe(0);
    expect(reference.summary.near_edge.in_two_or_more).toBe(0);
  });

  it("finds the same suburb (or none) for 1,500 uniform points over the SA bounding box", () => {
    expect(disagreements(reference.uniform)).toEqual([]);
    // the box covers sea and neighbouring states too, so both outcomes are exercised
    expect(reference.summary.uniform.in_a_suburb).toBe(960);
  });

  it("finds the same side for 1,500 points 10 cm either side of a boundary edge", () => {
    expect(disagreements(reference.near_edge)).toEqual([]);
    expect(reference.summary.near_edge.in_a_suburb).toBe(1403);
  });
});
