import { describe, expect, it } from "vitest";
import type { MockAddress } from "@/lib/generator/generate";
import type { Suburb } from "@/lib/suburbs";
import { MOCK_STAMP, RA_NAMES } from "@/lib/suburbs";
import type { Polygon, MultiPolygon } from "geojson";
import {
  checkRequiredFields,
  checkStateIsSA,
  checkPostcodeRange,
  checkPostcodeMatchesSuburb,
  checkSuburbExists,
  checkRemotenessMatches,
  checkSeifaMatches,
  checkMockStamp,
  checkNoDuplicateAddresses,
  checkNoDuplicateCoords,
  checkCoordsInSA,
  checkPointInSuburb,
  checkPostcodeFormat,
  checkAddressFormat,
  checkStreetNumberRange,
  checkSeifaDecileRange,
  checkRemotenessLevel,
  checkCoordinateConsistency,
  checkSuburbMetadata,
} from "./checks";

// Test data helpers
function createValidAddress(overrides: Partial<MockAddress> = {}): MockAddress {
  return {
    id: 1,
    stamp: MOCK_STAMP,
    full_address: "42 Test Street, ADELAIDE SA 5000",
    street_address: "42 Test Street",
    street_number: 42,
    street_name: "Test Street",
    suburb: "ADELAIDE",
    postcode: "5000",
    council: "Adelaide City Council",
    remoteness_level: "Major Cities of Australia",
    seifa_decile_sa: 5,
    latitude: -34.9285,
    longitude: 138.6007,
    sal_code: "40001",
    ...overrides,
  };
}

function createSuburb(overrides: Partial<Suburb> = {}): Suburb {
  return {
    code: "40001",
    name: "ADELAIDE",
    official: "Adelaide (SA)",
    postcode: "5000",
    postcodes: ["5000"],
    council: "Adelaide City Council",
    lgaCode: "40070",
    ra: 0,
    raShare: 1.0,
    decileSa: 5,
    decileAus: 6,
    irsad: 1050,
    pop: 20000,
    areaKm2: 15.6,
    label: [138.6007, -34.9285],
    addressable: true,
    ...overrides,
  };
}

describe("checkRequiredFields", () => {
  it("passes valid records with all required fields", () => {
    const addresses = [createValidAddress(), createValidAddress({ id: 2 })];
    const result = checkRequiredFields(addresses);

    expect(result.id).toBe("required-fields");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.failedIds).toEqual([]);
  });

  it("fails when id is missing or not a number", () => {
    const addresses = [
      createValidAddress({ id: "not-a-number" as unknown as number }),
      createValidAddress({ id: 2 }),
    ];
    const result = checkRequiredFields(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual(["not-a-number"]);
  });

  it("fails when stamp is empty", () => {
    const addresses = [
      createValidAddress({ stamp: "" as typeof MOCK_STAMP }),
      createValidAddress({ id: 2 }),
    ];
    const result = checkRequiredFields(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails when string fields are empty", () => {
    const addresses = [
      createValidAddress({ full_address: "" }),
      createValidAddress({ id: 2, street_name: "" }),
      createValidAddress({ id: 3, suburb: "" }),
      createValidAddress({ id: 4 }),
    ];
    const result = checkRequiredFields(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(3);
    expect(result.failedIds).toEqual([1, 2, 3]);
  });

  it("fails when street_number is not a number", () => {
    const addresses = [
      createValidAddress({ street_number: "42" as unknown as number }),
      createValidAddress({ id: 2 }),
    ];
    const result = checkRequiredFields(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("allows nullable fields (coordinates, SEIFA) to be null", () => {
    const addresses = [
      createValidAddress({ latitude: null, longitude: null, seifa_decile_sa: null }),
    ];
    const result = checkRequiredFields(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles empty array", () => {
    const result = checkRequiredFields([]);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.failedIds).toEqual([]);
  });
});

describe("checkStateIsSA", () => {
  it("passes when full_address contains ' SA '", () => {
    const addresses = [
      createValidAddress(),
      createValidAddress({ id: 2, full_address: "10 Main St, GLENELG SA 5045" }),
    ];
    const result = checkStateIsSA(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when ' SA ' is missing", () => {
    const addresses = [
      createValidAddress({ full_address: "42 Test Street, ADELAIDE 5000" }),
      createValidAddress({ id: 2, full_address: "10 Main St, GLENELG NSW 2000" }),
      createValidAddress({ id: 3 }),
    ];
    const result = checkStateIsSA(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails when 'SA' appears without spaces", () => {
    const addresses = [
      createValidAddress({ full_address: "42 Test Street, ADELAIDESA5000" }),
    ];
    const result = checkStateIsSA(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe("checkPostcodeRange", () => {
  it("passes valid SA postcodes [5000, 5999]", () => {
    const addresses = [
      createValidAddress({ postcode: "5000" }),
      createValidAddress({ id: 2, postcode: "5999" }),
      createValidAddress({ id: 3, postcode: "5432" }),
    ];
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("fails postcodes below 5000", () => {
    const addresses = [
      createValidAddress({ postcode: "4999" }),
      createValidAddress({ id: 2, postcode: "3000" }),
      createValidAddress({ id: 3, postcode: "5000" }),
    ];
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails postcodes above 5999", () => {
    const addresses = [
      createValidAddress({ postcode: "6000" }),
      createValidAddress({ id: 2, postcode: "5999" }),
    ];
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails non-numeric postcodes", () => {
    const addresses = [
      createValidAddress({ postcode: "ABCD" }),
      createValidAddress({ id: 2, postcode: "500X" }),
    ];
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("handles boundary values correctly", () => {
    const addresses = [
      createValidAddress({ postcode: "5000" }),
      createValidAddress({ id: 2, postcode: "5999" }),
    ];
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });
});

describe("checkPostcodeMatchesSuburb", () => {
  it("passes when postcode matches suburb", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ postcodes: ["5000"] })],
      ["GLENELG", createSuburb({ code: "40002", postcodes: ["5045"] })],
    ]);
    const addresses = [
      createValidAddress({ postcode: "5000" }),
      createValidAddress({ id: 2, suburb: "GLENELG", postcode: "5045" }),
    ];
    const result = checkPostcodeMatchesSuburb(addresses, suburbs);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when postcode doesn't match suburb", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ postcodes: ["5000"] })],
    ]);
    const addresses = [
      createValidAddress({ postcode: "5045" }),
      createValidAddress({ id: 2, postcode: "5000" }),
    ];
    const result = checkPostcodeMatchesSuburb(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("passes when suburb not found (deferred to checkSuburbExists)", () => {
    const suburbs = new Map<string, Suburb>([]);
    const addresses = [createValidAddress()];
    const result = checkPostcodeMatchesSuburb(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles suburbs with multiple postcodes", () => {
    const suburbs = new Map<string, Suburb>([
      ["ADELAIDE", createSuburb({ postcodes: ["5000", "5001", "5006"] })],
    ]);
    const addresses = [
      createValidAddress({ postcode: "5000" }),
      createValidAddress({ id: 2, postcode: "5001" }),
      createValidAddress({ id: 3, postcode: "5006" }),
      createValidAddress({ id: 4, postcode: "5002" }),
    ];
    const result = checkPostcodeMatchesSuburb(addresses, suburbs);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([4]);
  });
});

describe("checkSuburbExists", () => {
  it("passes when all suburbs exist in reference", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb()],
      ["GLENELG", createSuburb({ code: "40002" })],
    ]);
    const addresses = [
      createValidAddress({ suburb: "ADELAIDE" }),
      createValidAddress({ id: 2, suburb: "GLENELG" }),
    ];
    const result = checkSuburbExists(addresses, suburbs);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when suburb doesn't exist", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb()],
    ]);
    const addresses = [
      createValidAddress({ suburb: "NONEXISTENT" }),
      createValidAddress({ id: 2, suburb: "ADELAIDE" }),
      createValidAddress({ id: 3, suburb: "FAKE_SUBURB" }),
    ];
    const result = checkSuburbExists(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 3]);
  });

  it("handles empty suburbs map", () => {
    const suburbs = new Map();
    const addresses = [createValidAddress()];
    const result = checkSuburbExists(addresses, suburbs);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe("checkRemotenessMatches", () => {
  it("passes when remoteness matches suburb", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ ra: 0 })],
      ["REGIONAL", createSuburb({ code: "40002", name: "REGIONAL", ra: 1 })],
    ]);
    const addresses = [
      createValidAddress({ remoteness_level: RA_NAMES[0] }),
      createValidAddress({ id: 2, suburb: "REGIONAL", remoteness_level: RA_NAMES[1] }),
    ];
    const result = checkRemotenessMatches(addresses, suburbs);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when remoteness doesn't match", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ ra: 0 })],
    ]);
    const addresses = [
      createValidAddress({ remoteness_level: RA_NAMES[1] }),
      createValidAddress({ id: 2, remoteness_level: RA_NAMES[0] }),
    ];
    const result = checkRemotenessMatches(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("passes when suburb not found", () => {
    const suburbs = new Map<string, Suburb>([]);
    const addresses = [createValidAddress()];
    const result = checkRemotenessMatches(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles all remoteness levels", () => {
    const suburbs = new Map<string, Suburb>([
      ["RA0", createSuburb({ code: "1", name: "RA0", ra: 0 })],
      ["RA1", createSuburb({ code: "2", name: "RA1", ra: 1 })],
      ["RA2", createSuburb({ code: "3", name: "RA2", ra: 2 })],
      ["RA3", createSuburb({ code: "4", name: "RA3", ra: 3 })],
      ["RA4", createSuburb({ code: "5", name: "RA4", ra: 4 })],
    ]);
    const addresses = [
      createValidAddress({ suburb: "RA0", remoteness_level: RA_NAMES[0] }),
      createValidAddress({ id: 2, suburb: "RA1", remoteness_level: RA_NAMES[1] }),
      createValidAddress({ id: 3, suburb: "RA2", remoteness_level: RA_NAMES[2] }),
      createValidAddress({ id: 4, suburb: "RA3", remoteness_level: RA_NAMES[3] }),
      createValidAddress({ id: 5, suburb: "RA4", remoteness_level: RA_NAMES[4] }),
    ];
    const result = checkRemotenessMatches(addresses, suburbs);

    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
  });
});

describe("checkSeifaMatches", () => {
  it("passes when SEIFA decile matches suburb", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ decileSa: 5 })],
      ["RICH", createSuburb({ code: "40002", name: "RICH", decileSa: 10 })],
    ]);
    const addresses = [
      createValidAddress({ seifa_decile_sa: 5 }),
      createValidAddress({ id: 2, suburb: "RICH", seifa_decile_sa: 10 }),
    ];
    const result = checkSeifaMatches(addresses, suburbs);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when SEIFA doesn't match", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ decileSa: 5 })],
    ]);
    const addresses = [
      createValidAddress({ seifa_decile_sa: 3 }),
      createValidAddress({ id: 2, seifa_decile_sa: 5 }),
    ];
    const result = checkSeifaMatches(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("passes when both are null", () => {
    const suburbs = new Map([
      ["NO_SEIFA", createSuburb({ decileSa: null })],
    ]);
    const addresses = [
      createValidAddress({ suburb: "NO_SEIFA", seifa_decile_sa: null }),
    ];
    const result = checkSeifaMatches(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails when one is null and the other isn't", () => {
    const suburbs = new Map([
      ["ADELAIDE", createSuburb({ decileSa: 5 })],
      ["NO_SEIFA", createSuburb({ code: "40002", name: "NO_SEIFA", decileSa: null })],
    ]);
    const addresses = [
      createValidAddress({ seifa_decile_sa: null }),
      createValidAddress({ id: 2, suburb: "NO_SEIFA", seifa_decile_sa: 5 }),
    ];
    const result = checkSeifaMatches(addresses, suburbs);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("passes when suburb not found", () => {
    const suburbs = new Map<string, Suburb>([]);
    const addresses = [createValidAddress()];
    const result = checkSeifaMatches(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe("checkMockStamp", () => {
  it("passes when stamp is correct", () => {
    const addresses = [
      createValidAddress(),
      createValidAddress({ id: 2 }),
    ];
    const result = checkMockStamp(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when stamp is wrong", () => {
    const addresses = [
      createValidAddress({ stamp: "wrong stamp" as typeof MOCK_STAMP }),
      createValidAddress({ id: 2 }),
      createValidAddress({ id: 3, stamp: "" as typeof MOCK_STAMP }),
    ];
    const result = checkMockStamp(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 3]);
  });
});

describe("checkNoDuplicateAddresses", () => {
  it("passes when all addresses are unique", () => {
    const addresses = [
      createValidAddress(),
      createValidAddress({ id: 2, full_address: "10 Main St, GLENELG SA 5045" }),
      createValidAddress({ id: 3, full_address: "99 Beach Rd, BRIGHTON SA 5048" }),
    ];
    const result = checkNoDuplicateAddresses(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("fails all records with duplicate addresses", () => {
    const addresses = [
      createValidAddress({ id: 1 }),
      createValidAddress({ id: 2 }),
      createValidAddress({ id: 3, full_address: "10 Main St, GLENELG SA 5045" }),
    ];
    const result = checkNoDuplicateAddresses(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails all records in a triplicate set", () => {
    const addresses = [
      createValidAddress({ id: 1 }),
      createValidAddress({ id: 2 }),
      createValidAddress({ id: 3 }),
    ];
    const result = checkNoDuplicateAddresses(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.failedIds).toEqual([1, 2, 3]);
  });

  it("handles multiple duplicate groups", () => {
    const addresses = [
      createValidAddress({ id: 1, full_address: "A" }),
      createValidAddress({ id: 2, full_address: "A" }),
      createValidAddress({ id: 3, full_address: "B" }),
      createValidAddress({ id: 4, full_address: "B" }),
      createValidAddress({ id: 5, full_address: "C" }),
    ];
    const result = checkNoDuplicateAddresses(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(4);
    expect(result.failedIds).toEqual([1, 2, 3, 4]);
  });

  it("sorts failedIds", () => {
    const addresses = [
      createValidAddress({ id: 5 }),
      createValidAddress({ id: 1 }),
      createValidAddress({ id: 3 }),
    ];
    const result = checkNoDuplicateAddresses(addresses);

    expect(result.failedIds).toEqual([1, 3, 5]);
  });
});

describe("checkNoDuplicateCoords", () => {
  it("passes when all coordinates are unique", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: -34.95, longitude: 138.5 }),
      createValidAddress({ id: 3, latitude: -35.0, longitude: 138.7 }),
    ];
    const result = checkNoDuplicateCoords(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("fails all records with duplicate coordinates", () => {
    const addresses = [
      createValidAddress({ id: 1, latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 3, latitude: -34.95, longitude: 138.5 }),
    ];
    const result = checkNoDuplicateCoords(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("ignores null coordinates", () => {
    const addresses = [
      createValidAddress({ id: 1, latitude: null, longitude: null }),
      createValidAddress({ id: 2, latitude: null, longitude: null }),
      createValidAddress({ id: 3, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkNoDuplicateCoords(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("ignores partially null coordinates", () => {
    const addresses = [
      createValidAddress({ id: 1, latitude: -34.9, longitude: null }),
      createValidAddress({ id: 2, latitude: null, longitude: 138.6 }),
      createValidAddress({ id: 3, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkNoDuplicateCoords(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("sorts failedIds", () => {
    const addresses = [
      createValidAddress({ id: 5, latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 1, latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 3, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkNoDuplicateCoords(addresses);

    expect(result.failedIds).toEqual([1, 3, 5]);
  });
});

describe("checkCoordsInSA", () => {
  // SA_BBOX is [129.0, -38.06, 141.0, -25.99]

  it("passes when coordinates are inside SA bounding box", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: -26.0, longitude: 130.0 }),
      createValidAddress({ id: 3, latitude: -38.0, longitude: 140.0 }),
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("passes when coordinates are null", () => {
    const addresses = [
      createValidAddress({ latitude: null, longitude: null }),
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails when longitude is too low", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 128.8 }), // Below SA_BBOX min
      createValidAddress({ id: 2, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails when longitude is too high", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 141.2 }), // Above SA_BBOX max
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when latitude is too low", () => {
    const addresses = [
      createValidAddress({ latitude: -38.3, longitude: 138.6 }), // Below SA_BBOX min
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when latitude is too high", () => {
    const addresses = [
      createValidAddress({ latitude: -25.8, longitude: 138.6 }), // Above SA_BBOX max
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles boundary values correctly", () => {
    const addresses = [
      createValidAddress({ id: 1, latitude: -38.06, longitude: 129.0 }),
      createValidAddress({ id: 2, latitude: -25.99, longitude: 141.0 }),
    ];
    const result = checkCoordsInSA(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });
});

describe("checkPointInSuburb", () => {
  const square: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [138.5, -35.0],
        [138.7, -35.0],
        [138.7, -34.8],
        [138.5, -34.8],
        [138.5, -35.0],
      ],
    ],
  };

  it("passes when point is inside suburb polygon", () => {
    const geoms = new Map<string, Polygon>([["40001", square]]);
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkPointInSuburb(addresses, geoms);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails when point is outside suburb polygon", () => {
    const geoms = new Map<string, Polygon>([["40001", square]]);
    const addresses = [
      createValidAddress({ latitude: -34.7, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkPointInSuburb(addresses, geoms);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("passes when coordinates are null", () => {
    const geoms = new Map<string, Polygon>([["40001", square]]);
    const addresses = [
      createValidAddress({ latitude: null, longitude: null }),
    ];
    const result = checkPointInSuburb(addresses, geoms);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("passes when geometry not found", () => {
    const geoms = new Map();
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkPointInSuburb(addresses, geoms);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe("checkPostcodeFormat", () => {
  it("passes 4-digit postcodes", () => {
    const addresses = [
      createValidAddress({ postcode: "5000" }),
      createValidAddress({ id: 2, postcode: "5999" }),
    ];
    const result = checkPostcodeFormat(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails postcodes with wrong length", () => {
    const addresses = [
      createValidAddress({ postcode: "500" }),
      createValidAddress({ id: 2, postcode: "50000" }),
      createValidAddress({ id: 3, postcode: "5000" }),
    ];
    const result = checkPostcodeFormat(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails non-numeric postcodes", () => {
    const addresses = [
      createValidAddress({ postcode: "ABCD" }),
      createValidAddress({ id: 2, postcode: "500X" }),
    ];
    const result = checkPostcodeFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("fails postcodes with spaces", () => {
    const addresses = [
      createValidAddress({ postcode: "5 000" }),
      createValidAddress({ id: 2, postcode: " 5000" }),
    ];
    const result = checkPostcodeFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(2);
  });
});

describe("checkAddressFormat", () => {
  it("passes correctly formatted addresses", () => {
    const addresses = [
      createValidAddress(),
      createValidAddress({
        id: 2,
        street_number: 100,
        street_name: "King William Road",
        suburb: "GLENELG",
        postcode: "5045",
        street_address: "100 King William Road",
        full_address: "100 King William Road, GLENELG SA 5045",
      }),
    ];
    const result = checkAddressFormat(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("fails when street_address doesn't match components", () => {
    const addresses = [
      createValidAddress({ street_address: "WRONG" }),
    ];
    const result = checkAddressFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when full_address doesn't match components", () => {
    const addresses = [
      createValidAddress({ full_address: "WRONG" }),
    ];
    const result = checkAddressFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when both addresses are wrong", () => {
    const addresses = [
      createValidAddress({
        street_address: "WRONG",
        full_address: "ALSO WRONG",
      }),
    ];
    const result = checkAddressFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when street_address is correct but full_address is wrong", () => {
    const addresses = [
      createValidAddress({
        street_address: "42 Test Street",
        full_address: "42 Test Street, ADELAIDE NSW 2000",
      }),
    ];
    const result = checkAddressFormat(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe("checkStreetNumberRange", () => {
  it("passes valid street numbers [1, 999]", () => {
    const addresses = [
      createValidAddress({ street_number: 1 }),
      createValidAddress({ id: 2, street_number: 500 }),
      createValidAddress({ id: 3, street_number: 999 }),
    ];
    const result = checkStreetNumberRange(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("fails street number below 1", () => {
    const addresses = [
      createValidAddress({ street_number: 0 }),
      createValidAddress({ id: 2, street_number: -1 }),
      createValidAddress({ id: 3, street_number: 1 }),
    ];
    const result = checkStreetNumberRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails street number above 999", () => {
    const addresses = [
      createValidAddress({ street_number: 1000 }),
      createValidAddress({ id: 2, street_number: 999 }),
    ];
    const result = checkStreetNumberRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails non-integer street numbers", () => {
    const addresses = [
      createValidAddress({ street_number: 42.5 }),
      createValidAddress({ id: 2, street_number: 42 }),
    ];
    const result = checkStreetNumberRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("handles boundary values correctly", () => {
    const addresses = [
      createValidAddress({ street_number: 1 }),
      createValidAddress({ id: 2, street_number: 999 }),
    ];
    const result = checkStreetNumberRange(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });
});

describe("checkSeifaDecileRange", () => {
  it("passes valid SEIFA deciles [1, 10]", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: 1 }),
      createValidAddress({ id: 2, seifa_decile_sa: 5 }),
      createValidAddress({ id: 3, seifa_decile_sa: 10 }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("passes null SEIFA decile", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: null }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails SEIFA decile below 1", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: 0 }),
      createValidAddress({ id: 2, seifa_decile_sa: -1 }),
      createValidAddress({ id: 3, seifa_decile_sa: 1 }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails SEIFA decile above 10", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: 11 }),
      createValidAddress({ id: 2, seifa_decile_sa: 10 }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails non-integer SEIFA deciles", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: 5.5 }),
      createValidAddress({ id: 2, seifa_decile_sa: 5 }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("handles boundary values correctly", () => {
    const addresses = [
      createValidAddress({ seifa_decile_sa: 1 }),
      createValidAddress({ id: 2, seifa_decile_sa: 10 }),
      createValidAddress({ id: 3, seifa_decile_sa: null }),
    ];
    const result = checkSeifaDecileRange(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });
});

describe("checkRemotenessLevel", () => {
  it("passes valid remoteness levels", () => {
    const addresses = [
      createValidAddress({ remoteness_level: RA_NAMES[0] }),
      createValidAddress({ id: 2, remoteness_level: RA_NAMES[1] }),
      createValidAddress({ id: 3, remoteness_level: RA_NAMES[4] }),
    ];
    const result = checkRemotenessLevel(addresses);

    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("fails invalid remoteness levels", () => {
    const addresses = [
      createValidAddress({ remoteness_level: "Invalid Level" }),
      createValidAddress({ id: 2, remoteness_level: "Major Cities" }),
      createValidAddress({ id: 3, remoteness_level: RA_NAMES[0] }),
    ];
    const result = checkRemotenessLevel(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
  });

  it("fails empty remoteness level", () => {
    const addresses = [
      createValidAddress({ remoteness_level: "" }),
    ];
    const result = checkRemotenessLevel(addresses);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles all five valid remoteness levels", () => {
    const addresses = RA_NAMES.map((ra, i) =>
      createValidAddress({ id: i + 1, remoteness_level: ra })
    );
    const result = checkRemotenessLevel(addresses);

    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
  });
});

describe("checkCoordinateConsistency", () => {
  it("passes when both coordinates are present", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkCoordinateConsistency(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("passes when both coordinates are null", () => {
    const addresses = [
      createValidAddress({ latitude: null, longitude: null }),
    ];
    const result = checkCoordinateConsistency(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails when only latitude is null", () => {
    const addresses = [
      createValidAddress({ latitude: null, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkCoordinateConsistency(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("fails when only longitude is null", () => {
    const addresses = [
      createValidAddress({ latitude: -34.9, longitude: null }),
      createValidAddress({ id: 2, latitude: -34.9, longitude: 138.6 }),
    ];
    const result = checkCoordinateConsistency(addresses);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([1]);
  });

  it("handles mixed batch correctly", () => {
    const addresses = [
      createValidAddress({ id: 1, latitude: -34.9, longitude: 138.6 }),
      createValidAddress({ id: 2, latitude: null, longitude: null }),
      createValidAddress({ id: 3, latitude: null, longitude: 138.6 }),
      createValidAddress({ id: 4, latitude: -34.9, longitude: null }),
    ];
    const result = checkCoordinateConsistency(addresses);

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([3, 4]);
  });
});

describe("checkSuburbMetadata", () => {
  it("passes when all metadata matches", () => {
    const suburbs = [
      createSuburb({ name: "ADELAIDE", council: "Adelaide City Council", ra: 0, decileSa: 5 }),
    ];
    const addresses = [
      createValidAddress({
        suburb: "ADELAIDE",
        council: "Adelaide City Council",
        remoteness_level: RA_NAMES[0],
        seifa_decile_sa: 5,
      }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails when council doesn't match", () => {
    const suburbs = [
      createSuburb({ name: "ADELAIDE", council: "Adelaide City Council", ra: 0, decileSa: 5 }),
    ];
    const addresses = [
      createValidAddress({
        suburb: "ADELAIDE",
        council: "Wrong Council",
        remoteness_level: RA_NAMES[0],
        seifa_decile_sa: 5,
      }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when remoteness doesn't match", () => {
    const suburbs = [
      createSuburb({ name: "ADELAIDE", council: "Adelaide City Council", ra: 0, decileSa: 5 }),
    ];
    const addresses = [
      createValidAddress({
        suburb: "ADELAIDE",
        council: "Adelaide City Council",
        remoteness_level: RA_NAMES[1],
        seifa_decile_sa: 5,
      }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("fails when SEIFA doesn't match", () => {
    const suburbs = [
      createSuburb({ name: "ADELAIDE", council: "Adelaide City Council", ra: 0, decileSa: 5 }),
    ];
    const addresses = [
      createValidAddress({
        suburb: "ADELAIDE",
        council: "Adelaide City Council",
        remoteness_level: RA_NAMES[0],
        seifa_decile_sa: 3,
      }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("passes when suburb not found", () => {
    const suburbs = [createSuburb()];
    const addresses = [
      createValidAddress({ suburb: "NONEXISTENT" }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles mixed batch with multiple failures", () => {
    const suburbs = [
      createSuburb({ name: "ADELAIDE", council: "Adelaide City Council", ra: 0, decileSa: 5 }),
      createSuburb({
        code: "40002",
        name: "GLENELG",
        council: "Holdfast Bay Council",
        ra: 0,
        decileSa: 8,
      }),
    ];
    const addresses = [
      createValidAddress({
        id: 1,
        suburb: "ADELAIDE",
        council: "Adelaide City Council",
        remoteness_level: RA_NAMES[0],
        seifa_decile_sa: 5,
      }),
      createValidAddress({
        id: 2,
        suburb: "GLENELG",
        council: "Wrong Council",
        remoteness_level: RA_NAMES[0],
        seifa_decile_sa: 8,
      }),
      createValidAddress({
        id: 3,
        suburb: "ADELAIDE",
        council: "Wrong Council",
        remoteness_level: RA_NAMES[1],
        seifa_decile_sa: 3,
      }),
    ];
    const result = checkSuburbMetadata(addresses, suburbs);

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([2, 3]);
  });
});

describe("batch checks with mixed pass/fail", () => {
  it("handles large mixed batches correctly", () => {
    const addresses: MockAddress[] = [];
    for (let i = 1; i <= 100; i++) {
      addresses.push(
        createValidAddress({
          id: i,
          postcode: i % 5 === 0 ? "4999" : "5000",
        })
      );
    }
    const result = checkPostcodeRange(addresses);

    expect(result.passed).toBe(80);
    expect(result.failed).toBe(20);
    expect(result.failedIds.length).toBe(20);
    expect(result.failedIds[0]).toBe(5);
    expect(result.failedIds[1]).toBe(10);
  });

  it("handles empty arrays gracefully", () => {
    expect(checkRequiredFields([]).passed).toBe(0);
    expect(checkStateIsSA([]).failed).toBe(0);
    expect(checkPostcodeRange([]).failedIds).toEqual([]);
    expect(checkNoDuplicateAddresses([]).passed).toBe(0);
  });

  it("handles single-element arrays", () => {
    const addr = createValidAddress();
    expect(checkRequiredFields([addr]).passed).toBe(1);
    expect(checkStateIsSA([addr]).passed).toBe(1);
    expect(checkMockStamp([addr]).failed).toBe(0);
  });
});

