import { describe, expect, it } from "vitest";
import {
  buildPhotonReverseUrl,
  buildPhotonUrl,
  geocodeQuerySchema,
  normalisePhoton,
  photonResponseSchema,
  reverseQuerySchema,
} from "./photon";

const sample = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        osm_type: "W",
        osm_id: 105574130,
        osm_value: "university",
        name: "University of Adelaide",
        street: "North Terrace",
        district: "Adelaide",
        city: "Adelaide",
        state: "South Australia",
        postcode: "5000",
        countrycode: "AU",
      },
      geometry: { type: "Point", coordinates: [138.6042367, -34.9189226] },
    },
    {
      type: "Feature",
      properties: {
        osm_type: "N",
        osm_id: 1,
        name: "Adelaide St",
        state: "Victoria",
        countrycode: "AU",
      },
      geometry: { type: "Point", coordinates: [145.0, -37.8] },
    },
    {
      type: "Feature",
      properties: {
        osm_type: "N",
        osm_id: 2,
        housenumber: "10",
        street: "Main Street",
        city: "Kapunda",
        postcode: "5373",
      },
      geometry: { type: "Point", coordinates: [138.91, -34.34] },
    },
  ],
};

describe("photon helpers", () => {
  it("builds an SA-bounded request URL", () => {
    const url = new URL(buildPhotonUrl("North Terrace", 5));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("North Terrace");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("bbox")).toBe("128.9,-38.2,141.1,-25.9");
  });

  it("validates queries", () => {
    expect(geocodeQuerySchema.safeParse({ q: "ab" }).success).toBe(false);
    expect(geocodeQuerySchema.parse({ q: "  Glenelg  " })).toEqual({
      q: "Glenelg",
      limit: 6,
    });
    expect(geocodeQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
  });

  it("keeps South Australian results only", () => {
    const parsed = photonResponseSchema.parse(sample);
    const rows = normalisePhoton(parsed);
    expect(rows.map((r) => r.label)).toEqual([
      "University of Adelaide",
      "10 Main Street",
    ]);
    expect(rows[0].detail).toBe("North Terrace, Adelaide, 5000");
    expect(rows[1].photonLocality).toBe("Kapunda");
  });

  it("lists every place name a hit gives, for the /verify spot check", () => {
    const rows = normalisePhoton(photonResponseSchema.parse(sample));
    expect(rows[0].photonPlaces).toEqual(["Adelaide"]);
    expect(rows[1].photonPlaces).toEqual(["Kapunda"]);
    const reverse = normalisePhoton(
      photonResponseSchema.parse({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              osm_type: "W",
              osm_id: 1458247216,
              type: "locality",
              name: "Kingslea",
              district: "Glenelg North",
              city: "Adelaide",
              state: "South Australia",
              postcode: "5045",
              countrycode: "AU",
            },
            geometry: { type: "Point", coordinates: [138.5228863, -34.9751022] },
          },
        ],
      }),
    );
    expect(reverse[0].photonPlaces).toEqual(["Glenelg North", "Adelaide", "Kingslea"]);
    expect(reverse[0].photonPostcode).toBe("5045");
  });
});

describe("photon reverse geocoding", () => {
  it("builds a one-result reverse URL to 6 decimal places", () => {
    const url = new URL(buildPhotonReverseUrl(138.51557, -34.98087));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/reverse");
    expect(url.searchParams.get("lon")).toBe("138.515570");
    expect(url.searchParams.get("lat")).toBe("-34.980870");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("only accepts points inside South Australia's bounding box", () => {
    expect(reverseQuerySchema.parse({ lat: "-34.98", lon: "138.51" })).toEqual({
      lat: -34.98,
      lon: 138.51,
    });
    expect(reverseQuerySchema.safeParse({ lat: "-37.81", lon: "144.96" }).success).toBe(
      false,
    );
    expect(reverseQuerySchema.safeParse({ lat: "", lon: "" }).success).toBe(false);
    expect(reverseQuerySchema.safeParse({ lat: "x", lon: "138" }).success).toBe(false);
  });
});
