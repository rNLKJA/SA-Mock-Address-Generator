import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { ADELAIDE_GPO, GeometryIndex, bboxOf, haversineKm, pointInGeometry } from "./geo";
import { PythonRandom } from "./rng/python-random";
import { salGeojson, suburbsJson } from "./test-utils/data";

const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ],
  ],
};

describe("point in polygon", () => {
  it("respects holes", () => {
    expect(pointInGeometry([3, 3], square)).toBe(true);
    expect(pointInGeometry([1.5, 1.5], square)).toBe(false);
    expect(pointInGeometry([5, 5], square)).toBe(false);
    expect(bboxOf(square)).toEqual([0, 0, 4, 4]);
  });
});

describe("haversine", () => {
  it("measures Adelaide GPO to Mount Gambier at about 370 km", () => {
    expect(haversineKm(ADELAIDE_GPO, [140.7828, -37.8296])).toBeGreaterThan(360);
    expect(haversineKm(ADELAIDE_GPO, [140.7828, -37.8296])).toBeLessThan(385);
    expect(haversineKm(ADELAIDE_GPO, ADELAIDE_GPO)).toBe(0);
  });
});

describe("GeometryIndex over the SAL boundaries", () => {
  const index = new GeometryIndex(salGeojson);
  const byCode = new Map(suburbsJson.rows.map((r) => [r.code, r]));

  it("indexes every rebuilt suburb", () => {
    expect(index.size).toBe(suburbsJson.rows.length);
    for (const r of suburbsJson.rows) expect(index.has(r.code)).toBe(true);
  });

  it("locates well-known places", () => {
    expect(byCode.get(index.locate(ADELAIDE_GPO)!)?.name).toBe("ADELAIDE");
    expect(byCode.get(index.locate([138.5131, -34.98])!)?.name).toBe("GLENELG");
    expect(index.locate([144.9631, -37.8136])).toBeNull(); // Melbourne
  });

  it("finds the nearest suburb for points just offshore", () => {
    const jetty: [number, number] = [138.5092949, -34.9804861];
    expect(index.locate(jetty)).toBeNull();
    const near = index.nearest(jetty)!;
    expect(byCode.get(near.code)?.name).toBe("GLENELG");
    expect(near.km).toBeLessThan(1);
    expect(index.nearest([150, -30])).toBeNull();
  });

  it("puts every label point inside its own suburb", () => {
    for (const r of suburbsJson.rows) expect(index.locate(r.label)).toBe(r.code);
  });

  it("samples seeded points inside the boundary", () => {
    const rng = new PythonRandom(7);
    for (const code of ["40002", "40001", "41285"]) {
      const p = index.samplePoint(code, rng)!;
      expect(p).not.toBeNull();
      expect(index.locate(p)).toBe(code);
    }
    const again = new GeometryIndex(salGeojson).samplePoint("40002", new PythonRandom(7));
    expect(again).toEqual(
      new GeometryIndex(salGeojson).samplePoint("40002", new PythonRandom(7)),
    );
  });
});
