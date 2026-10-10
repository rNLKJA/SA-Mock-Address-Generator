/**
 * Core verification logic for the Verification Lab.
 *
 * Individual check functions that test address batches for correctness,
 * consistency, and conformance to the reference data.
 */
import type { MockAddress } from "@/lib/generator/generate";
import type { Suburb } from "@/lib/suburbs";
import { MOCK_STAMP, RA_NAMES } from "@/lib/suburbs";
import { SA_BBOX, pointInGeometry } from "@/lib/geo";
import type { Polygon, MultiPolygon } from "geojson";
import type { RecordCheck } from "./types";

/**
 * Check that all required fields are present (non-empty for strings,
 * numeric for numbers). Nullable fields (coordinates, SEIFA) are allowed to be null.
 */
export function checkRequiredFields(addresses: readonly MockAddress[]): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const ok =
      typeof addr.id === "number" &&
      typeof addr.stamp === "string" &&
      addr.stamp.length > 0 &&
      typeof addr.full_address === "string" &&
      addr.full_address.length > 0 &&
      typeof addr.street_address === "string" &&
      addr.street_address.length > 0 &&
      typeof addr.street_number === "number" &&
      typeof addr.street_name === "string" &&
      addr.street_name.length > 0 &&
      typeof addr.suburb === "string" &&
      addr.suburb.length > 0 &&
      typeof addr.postcode === "string" &&
      addr.postcode.length > 0 &&
      typeof addr.council === "string" &&
      addr.council.length > 0 &&
      typeof addr.remoteness_level === "string" &&
      addr.remoteness_level.length > 0 &&
      typeof addr.sal_code === "string" &&
      addr.sal_code.length > 0;

    if (ok) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "required-fields",
    label: "Required fields present",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that full address contains " SA " (state is South Australia).
 */
export function checkStateIsSA(addresses: readonly MockAddress[]): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (addr.full_address.includes(" SA ")) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "state-is-sa",
    label: "State is SA",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that postcode is in SA range [5000, 5999].
 */
export function checkPostcodeRange(addresses: readonly MockAddress[]): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const code = parseInt(addr.postcode, 10);
    if (!isNaN(code) && code >= 5000 && code <= 5999) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "postcode-range",
    label: "Postcode in SA range [5000, 5999]",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that postcode matches the suburb's majority postcode in the reference data.
 * Accepts a Map for efficient lookups.
 */
export function checkPostcodeMatchesSuburb(
  addresses: readonly MockAddress[],
  suburbsByName: ReadonlyMap<string, Suburb>,
): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const suburb = suburbsByName.get(addr.suburb);
    // If suburb not found, pass (it will be caught by checkSuburbExists)
    if (!suburb || suburb.postcodes.includes(addr.postcode)) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "postcode-matches-suburb",
    label: "Postcode matches suburb",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that suburb exists in the reference data.
 */
export function checkSuburbExists(
  addresses: readonly MockAddress[],
  suburbsByName: ReadonlyMap<string, Suburb>,
): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (suburbsByName.has(addr.suburb)) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "suburb-exists",
    label: "Suburb exists in reference",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that remoteness level matches the suburb's RA in the reference.
 */
export function checkRemotenessMatches(
  addresses: readonly MockAddress[],
  suburbsByName: ReadonlyMap<string, Suburb>,
): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const suburb = suburbsByName.get(addr.suburb);
    if (!suburb || RA_NAMES[suburb.ra] === addr.remoteness_level) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "remoteness-matches",
    label: "Remoteness matches suburb",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that SEIFA decile matches the suburb's decileSa (or both are null).
 */
export function checkSeifaMatches(
  addresses: readonly MockAddress[],
  suburbsByName: ReadonlyMap<string, Suburb>,
): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const suburb = suburbsByName.get(addr.suburb);
    if (!suburb || suburb.decileSa === addr.seifa_decile_sa) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "seifa-matches",
    label: "SEIFA decile matches suburb",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that the mock stamp is present and correct.
 */
export function checkMockStamp(addresses: readonly MockAddress[]): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (addr.stamp === MOCK_STAMP) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "mock-stamp",
    label: "Mock stamp present",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that no duplicate full_address values exist.
 */
export function checkNoDuplicateAddresses(addresses: readonly MockAddress[]): RecordCheck {
  const seen = new Map<string, number[]>();

  for (const addr of addresses) {
    const ids = seen.get(addr.full_address);
    if (ids) {
      ids.push(addr.id);
    } else {
      seen.set(addr.full_address, [addr.id]);
    }
  }

  const failedIds: number[] = [];
  for (const ids of seen.values()) {
    if (ids.length > 1) {
      failedIds.push(...ids);
    }
  }
  failedIds.sort((a, b) => a - b);

  return {
    id: "no-duplicate-addresses",
    label: "No duplicate addresses",
    passed: addresses.length - failedIds.length,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that no duplicate (latitude, longitude) pairs exist (ignoring nulls).
 */
export function checkNoDuplicateCoords(addresses: readonly MockAddress[]): RecordCheck {
  const seen = new Map<string, number[]>();

  for (const addr of addresses) {
    if (addr.latitude === null || addr.longitude === null) continue;
    const key = `${addr.latitude},${addr.longitude}`;
    const ids = seen.get(key);
    if (ids) {
      ids.push(addr.id);
    } else {
      seen.set(key, [addr.id]);
    }
  }

  const failedIds: number[] = [];
  for (const ids of seen.values()) {
    if (ids.length > 1) {
      failedIds.push(...ids);
    }
  }
  failedIds.sort((a, b) => a - b);

  return {
    id: "no-duplicate-coords",
    label: "No duplicate coordinates",
    passed: addresses.length - failedIds.length,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that coordinates (if present) are inside the SA bounding box.
 */
export function checkCoordsInSA(addresses: readonly MockAddress[]): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  const [minLon, minLat, maxLon, maxLat] = SA_BBOX;

  for (const addr of addresses) {
    if (addr.latitude === null || addr.longitude === null) {
      passed++;
      continue;
    }
    const ok =
      addr.longitude >= minLon &&
      addr.longitude <= maxLon &&
      addr.latitude >= minLat &&
      addr.latitude <= maxLat;

    if (ok) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "coords-in-sa",
    label: "Coordinates inside SA bounding box",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

/**
 * Check that coordinates (if present) are inside the suburb's polygon.
 * Accepts a Map<sal_code, Polygon | MultiPolygon> for efficient lookups.
 */
export function checkPointInSuburb(
  addresses: readonly MockAddress[],
  geometryBySalCode: ReadonlyMap<string, Polygon | MultiPolygon>,
): RecordCheck {
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (addr.latitude === null || addr.longitude === null) {
      passed++;
      continue;
    }

    const geom = geometryBySalCode.get(addr.sal_code);
    // If geometry not found, pass (geometry might not be available for all suburbs)
    if (!geom || pointInGeometry([addr.longitude, addr.latitude], geom)) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "point-in-suburb",
    label: "Coordinates inside suburb boundary",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

// Additional check functions expected by verify.ts

export function checkPostcodeFormat(addresses: readonly MockAddress[]): RecordCheck {
  // Postcode should be exactly 4 digits
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (/^\d{4}$/.test(addr.postcode)) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "postcode-format",
    label: "Postcode is 4 digits",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkAddressFormat(addresses: readonly MockAddress[]): RecordCheck {
  // Check that full_address and street_address are correctly formatted
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const expectedStreetAddress = `${addr.street_number} ${addr.street_name}`;
    const expectedFullAddress = `${expectedStreetAddress}, ${addr.suburb} SA ${addr.postcode}`;

    if (
      addr.street_address === expectedStreetAddress &&
      addr.full_address === expectedFullAddress
    ) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "address-format",
    label: "Address formatting correct",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkStreetNumberRange(addresses: readonly MockAddress[]): RecordCheck {
  // Street number should be in [1, 999]
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (
      Number.isInteger(addr.street_number) &&
      addr.street_number >= 1 &&
      addr.street_number <= 999
    ) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "street-number-range",
    label: "Street number in [1, 999]",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkSeifaDecileRange(addresses: readonly MockAddress[]): RecordCheck {
  // SEIFA decile should be null or in [1, 10]
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (
      addr.seifa_decile_sa === null ||
      (Number.isInteger(addr.seifa_decile_sa) &&
        addr.seifa_decile_sa >= 1 &&
        addr.seifa_decile_sa <= 10)
    ) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "seifa-decile-range",
    label: "SEIFA decile in [1, 10] or null",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkRemotenessLevel(addresses: readonly MockAddress[]): RecordCheck {
  // Remoteness level should be one of RA_NAMES
  const validLevels = new Set(RA_NAMES);
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    if (validLevels.has(addr.remoteness_level as (typeof RA_NAMES)[number])) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "remoteness-level",
    label: "Remoteness level valid",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkCoordinateConsistency(addresses: readonly MockAddress[]): RecordCheck {
  // Both coordinates should be present or both null
  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const bothPresent = addr.latitude !== null && addr.longitude !== null;
    const bothNull = addr.latitude === null && addr.longitude === null;
    if (bothPresent || bothNull) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "coordinate-consistency",
    label: "Coordinates both present or both null",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkSuburbMetadata(
  addresses: readonly MockAddress[],
  suburbs: readonly Suburb[],
): RecordCheck {
  // Council, remoteness, and SEIFA should all match the suburb
  const suburbsByName = new Map<string, Suburb>();
  for (const s of suburbs) {
    suburbsByName.set(s.name, s);
  }

  const failedIds: number[] = [];
  let passed = 0;

  for (const addr of addresses) {
    const suburb = suburbsByName.get(addr.suburb);
    if (!suburb) {
      // Suburb not found - this will be caught by checkSuburbExists
      passed++;
      continue;
    }

    const councilMatches = suburb.council === addr.council;
    const remotenessMatches = RA_NAMES[suburb.ra] === addr.remoteness_level;
    const seifaMatches = suburb.decileSa === addr.seifa_decile_sa;

    if (councilMatches && remotenessMatches && seifaMatches) {
      passed++;
    } else {
      failedIds.push(addr.id);
    }
  }

  return {
    id: "suburb-metadata",
    label: "Suburb metadata (council, remoteness, SEIFA) matches",
    passed,
    failed: failedIds.length,
    failedIds,
  };
}

export function checkDuplicateAddresses(addresses: readonly MockAddress[]): RecordCheck {
  return checkNoDuplicateAddresses(addresses);
}

export function checkDuplicateCoordinates(addresses: readonly MockAddress[]): RecordCheck {
  return checkNoDuplicateCoords(addresses);
}
