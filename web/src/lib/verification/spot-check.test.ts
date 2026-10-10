import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@/lib/photon";
import { byCode, byName, generated } from "@/lib/test-utils/verification";
import {
  SPOT_CHECK_COOLDOWN_MS,
  SPOT_CHECK_GAP_MS,
  SPOT_CHECK_MAX,
  compareSpot,
  normalisePlace,
  spotCheckWait,
  spotSample,
  summariseSpots,
} from "./spot-check";
import type { SpotPoint } from "./types";

const hit = (over: Partial<GeocodeResult>): GeocodeResult => ({
  id: "N1",
  label: "Somewhere",
  detail: "",
  kind: "house",
  lonLat: [138.5, -34.9],
  photonPostcode: null,
  photonLocality: null,
  photonPlaces: [],
  ...over,
});

const glenelg: SpotPoint = {
  id: 7,
  full_address: "12 Main Street, GLENELG SA 5045",
  suburb: "GLENELG",
  suburbOfficial: "Glenelg",
  postcode: "5045",
  postcodes: ["5045"],
  latitude: -34.98,
  longitude: 138.515,
};

describe("spot check sample", () => {
  it("draws at most 10 rows with coordinates, seeded and in id order", () => {
    const set = generated({ count: 200 });
    const a = spotSample(set, byCode, 2025);
    expect(a).toHaveLength(SPOT_CHECK_MAX);
    expect(SPOT_CHECK_MAX).toBe(10);
    expect(a.map((p) => p.id)).toEqual([...a.map((p) => p.id)].sort((x, y) => x - y));
    expect(new Set(a.map((p) => p.id)).size).toBe(10);
    expect(spotSample(set, byCode, 2025)).toEqual(a);
    expect(spotSample(set, byCode, 2026)).not.toEqual(a);
    expect(spotSample(set, byCode, 1, 50)).toHaveLength(10);
  });

  it("carries the suburb's official name and every postcode", () => {
    const set = generated({ count: 30, filters: { suburb: "GLENELG" } });
    const [p] = spotSample(set, byCode, 1, 1);
    expect(p.suburbOfficial).toBe("Glenelg");
    expect(p.postcodes).toEqual(byName.get("GLENELG")!.postcodes);
  });

  it("skips rows without coordinates", () => {
    const set = generated({ count: 20, coordinates: false });
    expect(spotSample(set, byCode, 1)).toEqual([]);
    const some = generated({ count: 20 }).map((a) =>
      a.id > 3 ? { ...a, latitude: null, longitude: null } : a,
    );
    expect(spotSample(some, byCode, 1).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("stays well under the proxy's 30 requests a minute", () => {
    // one run of at most 10 requests, spaced out, and one run a minute
    expect(SPOT_CHECK_GAP_MS).toBeGreaterThanOrEqual(1000);
    expect(SPOT_CHECK_MAX * (60_000 / SPOT_CHECK_COOLDOWN_MS)).toBeLessThanOrEqual(10);
    expect(spotCheckWait(null, 5_000)).toBe(0);
    expect(spotCheckWait(1_000, 1_000)).toBe(60_000);
    expect(spotCheckWait(1_000, 31_000)).toBe(30_000);
    expect(spotCheckWait(1_000, 61_000)).toBe(0);
    expect(spotCheckWait(1_000, 90_000)).toBe(0);
  });
});

describe("spot check comparison", () => {
  it("normalises place names", () => {
    expect(normalisePlace("Glenelg North")).toBe("GLENELG NORTH");
    expect(normalisePlace("O'Halloran Hill")).toBe("O HALLORAN HILL");
    expect(normalisePlace("O'HALLORAN HILL")).toBe("O HALLORAN HILL");
    expect(normalisePlace("Adelaide (SA)")).toBe("ADELAIDE");
    expect(normalisePlace("  Mount   Gambier ")).toBe("MOUNT GAMBIER");
  });

  it("agrees when any of Photon's place names is the suburb", () => {
    const o = compareSpot(
      glenelg,
      hit({ photonPlaces: ["Glenelg", "Adelaide"], photonPostcode: "5045" }),
    );
    expect(o).toEqual({
      places: ["Glenelg", "Adelaide"],
      postcode: "5045",
      suburbAgrees: true,
      postcodeAgrees: true,
    });
  });

  it("disagrees with a neighbouring suburb and another postcode", () => {
    const o = compareSpot(
      glenelg,
      hit({ photonPlaces: ["Glenelg North", "Adelaide"], photonPostcode: "5044" }),
    );
    expect(o.suburbAgrees).toBe(false);
    expect(o.postcodeAgrees).toBe(false);
  });

  it("accepts any postcode the suburb overlaps", () => {
    const o = compareSpot(
      { ...glenelg, postcodes: ["5045", "5044"] },
      hit({ photonPostcode: "5044" }),
    );
    expect(o.postcodeAgrees).toBe(true);
    expect(o.suburbAgrees).toBeNull();
  });

  it("falls back to the single locality when the place list is empty", () => {
    const o = compareSpot(glenelg, hit({ photonLocality: "Glenelg" }));
    expect(o.suburbAgrees).toBe(true);
  });

  it("reports no answer as unknown, not as a disagreement", () => {
    expect(compareSpot(glenelg, null)).toEqual({
      places: [],
      postcode: null,
      suburbAgrees: null,
      postcodeAgrees: null,
    });
  });

  it("summarises agreement over the points Photon answered", () => {
    const s = summariseSpots([
      compareSpot(glenelg, hit({ photonPlaces: ["Glenelg"], photonPostcode: "5045" })),
      compareSpot(glenelg, hit({ photonPlaces: ["Brighton"], photonPostcode: "5045" })),
      compareSpot(glenelg, null),
      null,
    ]);
    expect(s).toEqual({
      checked: 3,
      answered: 2,
      suburbAgree: 1,
      suburbAsked: 2,
      postcodeAgree: 2,
      postcodeAsked: 2,
    });
  });
});
