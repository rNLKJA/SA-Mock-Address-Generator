/**
 * Record-level checks for the Verification Lab: each one is applied to every
 * address and reports how many passed, failed or did not apply, with the
 * failing rows and the reason each failed.
 *
 * The reference data is the site's own: the rebuilt suburb table
 * (public/data/suburbs.json) keyed by ABS SAL code, and the bundled SAL
 * boundaries (public/data/sal-sa.geojson) behind a GeometryIndex.
 */
import type { MockAddress } from "@/lib/generator/generate";
import { STREET_NAMES } from "@/lib/original/lookup";
import { pointInGeometry, type GeometryIndex, type LonLat } from "@/lib/geo";
import { MOCK_STAMP, RA_NAMES, formatFullAddress, type Suburb } from "@/lib/suburbs";
import type { RecordCheck, RowFailure } from "./types";

/** true: passed. A string: failed, for that reason. null: does not apply. */
type Outcome = true | string | null;

export function recordCheck(
  id: string,
  label: string,
  description: string,
  addresses: readonly MockAddress[],
  test: (a: MockAddress) => Outcome,
): RecordCheck {
  let passed = 0;
  let skipped = 0;
  const failures: RowFailure[] = [];
  for (const a of addresses) {
    const outcome = test(a);
    if (outcome === true) passed++;
    else if (outcome === null) skipped++;
    else failures.push({ id: a.id, reason: outcome });
  }
  failures.sort((x, y) => x.id - y.id);
  return {
    id,
    label,
    description,
    passed,
    failed: failures.length,
    skipped,
    failedIds: failures.map((f) => f.id),
    failures,
  };
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const hasPoint = (a: MockAddress) => a.latitude !== null && a.longitude !== null;
const pointOf = (a: MockAddress): LonLat => [a.longitude!, a.latitude!];
const fmtPoint = (a: MockAddress) => `(${a.latitude}, ${a.longitude})`;

/* ---------------------------------------------------------------------------
 * Fields and format
 * ------------------------------------------------------------------------- */

const TEXT_FIELDS = [
  "full_address",
  "street_address",
  "street_name",
  "suburb",
  "postcode",
  "council",
  "remoteness_level",
  "sal_code",
] as const;

/** Every column present with the right type, coordinates both set or both empty. */
export function checkRequiredFields(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "required-fields",
    "Required fields present and well-formed",
    "All 14 export columns are present: text fields non-empty, id and street number whole numbers, decile empty or whole, latitude and longitude both empty or both finite.",
    addresses,
    (a) => {
      const problems: string[] = [];
      if (!isWhole(a.id) || a.id < 1) problems.push("id is not a positive whole number");
      if (!isText(a.stamp)) problems.push("stamp is empty");
      for (const f of TEXT_FIELDS) if (!isText(a[f])) problems.push(`${f} is empty`);
      if (!isWhole(a.street_number)) problems.push("street_number is not a whole number");
      if (a.seifa_decile_sa !== null && !isWhole(a.seifa_decile_sa))
        problems.push("seifa_decile_sa is not a whole number");
      const lat = a.latitude;
      const lon = a.longitude;
      if ((lat === null) !== (lon === null))
        problems.push("only one of latitude and longitude is set");
      else if (
        lat !== null &&
        lon !== null &&
        !(Number.isFinite(lat) && Number.isFinite(lon))
      )
        problems.push("latitude or longitude is not a number");
      return problems.length ? problems.join(", ") : true;
    },
  );
}

export function checkMockStamp(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "mock-stamp",
    "MOCK marker on every record",
    `The stamp column reads "${MOCK_STAMP}".`,
    addresses,
    (a) => (a.stamp === MOCK_STAMP ? true : `stamp is "${a.stamp ?? ""}"`),
  );
}

export function checkAddressFormat(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "address-format",
    "Address assembled from its parts",
    'full_address is "N Street, SUBURB SA PPPP" and street_address is "N Street", built from the row\'s own columns.',
    addresses,
    (a) => {
      const street = `${a.street_number} ${a.street_name}`;
      const full = formatFullAddress(
        a.street_number,
        a.street_name,
        a.suburb,
        a.postcode,
      );
      if (a.street_address !== street)
        return `street_address "${a.street_address}" should be "${street}"`;
      if (a.full_address !== full)
        return `full_address "${a.full_address}" should be "${full}"`;
      return true;
    },
  );
}

export function checkStreetNumber(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "street-number",
    "Street number from 1 to 999",
    "The 2025 recipe draws randint(1, 999).",
    addresses,
    (a) =>
      isWhole(a.street_number) && a.street_number >= 1 && a.street_number <= 999
        ? true
        : `street number ${a.street_number} is outside 1 to 999`,
  );
}

const STREETS = new Set<string>(STREET_NAMES);

export function checkStreetName(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "street-name",
    "Street name from the 2025 list",
    `One of the ${STREET_NAMES.length} Adelaide street names the original generator used.`,
    addresses,
    (a) => (STREETS.has(a.street_name) ? true : `"${a.street_name}" is not on the list`),
  );
}

export function checkStateIsSA(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "state-is-sa",
    "State is SA",
    'The address names the state as "SA", directly before the postcode.',
    addresses,
    (a) =>
      isText(a.full_address) && /,\s.+\sSA\s\d{4}$/.test(a.full_address)
        ? true
        : `"${a.full_address}" does not end in "SA" and a postcode`,
  );
}

/** SA's postcode range, plus 0872, which the APY Lands share with the NT and WA. */
export function isSaPostcode(postcode: string): boolean {
  if (!/^\d{4}$/.test(postcode)) return false;
  const n = Number(postcode);
  return (n >= 5000 && n <= 5999) || postcode === "0872";
}

export function checkPostcodeRange(addresses: readonly MockAddress[]): RecordCheck {
  return recordCheck(
    "postcode-range",
    "Postcode in the SA range",
    "Four digits from 5000 to 5999, or 0872, the remote-area postcode the APY Lands share with the NT and WA.",
    addresses,
    (a) =>
      isSaPostcode(String(a.postcode))
        ? true
        : `postcode "${a.postcode}" is not an SA postcode`,
  );
}

/* ---------------------------------------------------------------------------
 * Reference data (suburb table, keyed by SAL code)
 * ------------------------------------------------------------------------- */

export type SuburbsByCode = ReadonlyMap<string, Suburb>;

export function checkSuburbInReference(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
): RecordCheck {
  return recordCheck(
    "suburb-in-reference",
    "Suburb exists in the SAL reference",
    "The SAL code is one of the 1,696 in the reference table and names the same suburb.",
    addresses,
    (a) => {
      const s = byCode.get(a.sal_code);
      if (!s) return `SAL code "${a.sal_code}" is not in the reference table`;
      if (s.name !== a.suburb) return `SAL ${a.sal_code} is ${s.name}, not ${a.suburb}`;
      return true;
    },
  );
}

/** A check against the row's reference suburb, skipped when the suburb is unknown. */
function referenceCheck(
  id: string,
  label: string,
  description: string,
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
  test: (a: MockAddress, s: Suburb) => Outcome,
): RecordCheck {
  return recordCheck(id, label, description, addresses, (a) => {
    const s = byCode.get(a.sal_code);
    return s && s.name === a.suburb ? test(a, s) : null;
  });
}

export function checkPostcodeMatchesSuburb(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
): RecordCheck {
  return referenceCheck(
    "postcode-matches-suburb",
    "Postcode consistent with the suburb",
    "The postcode is one of the ABS postal areas the suburb overlaps.",
    addresses,
    byCode,
    (a, s) =>
      s.postcodes.includes(a.postcode)
        ? true
        : `${a.postcode} is not a postcode of ${s.name} (${s.postcodes.join(", ")})`,
  );
}

export function checkCouncilMatches(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
): RecordCheck {
  return referenceCheck(
    "council-matches",
    "Council matches the reference",
    "The council is the suburb's majority local government area.",
    addresses,
    byCode,
    (a, s) =>
      a.council === s.council ? true : `council "${a.council}", reference "${s.council}"`,
  );
}

export function checkRemotenessMatches(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
): RecordCheck {
  return referenceCheck(
    "remoteness-matches",
    "Remoteness class matches the reference",
    "The remoteness class is exactly the suburb's ABS Remoteness Area, not just a valid class.",
    addresses,
    byCode,
    (a, s) =>
      a.remoteness_level === RA_NAMES[s.ra]
        ? true
        : `"${a.remoteness_level}", reference "${RA_NAMES[s.ra]}"`,
  );
}

export function checkIrsadMatches(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
): RecordCheck {
  return referenceCheck(
    "irsad-matches",
    "IRSAD decile matches the reference",
    "The decile is exactly the suburb's IRSAD decile within SA (empty where ABS publishes none), not just a number from 1 to 10.",
    addresses,
    byCode,
    (a, s) =>
      a.seifa_decile_sa === s.decileSa
        ? true
        : `decile ${a.seifa_decile_sa ?? "empty"}, reference ${s.decileSa ?? "empty"}`,
  );
}

/* ---------------------------------------------------------------------------
 * Point in polygon (bundled SAL boundaries)
 * ------------------------------------------------------------------------- */

function locatedName(index: GeometryIndex, byCode: SuburbsByCode, p: LonLat): string {
  const code = index.locate(p);
  if (!code) return "no SA suburb";
  return byCode.get(code)?.name ?? `SAL ${code}`;
}

export function checkPointInSuburb(
  addresses: readonly MockAddress[],
  index: GeometryIndex,
  byCode: SuburbsByCode,
): RecordCheck {
  return recordCheck(
    "point-in-suburb",
    "Point inside its own suburb boundary",
    "Ray casting against the record's own SAL boundary from the bundled GeoJSON (the generator's simplified polygons).",
    addresses,
    (a) => {
      if (!hasPoint(a)) return null;
      const geometry = index.geometry(a.sal_code);
      if (!geometry) return `no boundary for SAL code "${a.sal_code}"`;
      const p = pointOf(a);
      if (pointInGeometry(p, geometry)) return true;
      return `${fmtPoint(a)} is outside ${a.suburb} and falls in ${locatedName(index, byCode, p)}`;
    },
  );
}

export function checkPointInSouthAustralia(
  addresses: readonly MockAddress[],
  index: GeometryIndex,
): RecordCheck {
  return recordCheck(
    "point-in-sa",
    "Point inside South Australia",
    "The point lies inside one of the bundled SA suburb boundaries, which together cover the state's land.",
    addresses,
    (a) => {
      if (!hasPoint(a)) return null;
      const p = pointOf(a);
      const own = index.geometry(a.sal_code);
      if (own && pointInGeometry(p, own)) return true;
      return index.locate(p) ? true : `${fmtPoint(a)} is in no South Australian suburb`;
    },
  );
}

/* ---------------------------------------------------------------------------
 * Duplicates
 * ------------------------------------------------------------------------- */

function duplicates(
  id: string,
  label: string,
  description: string,
  addresses: readonly MockAddress[],
  key: (a: MockAddress) => string | null,
): RecordCheck {
  const groups = new Map<string, number[]>();
  for (const a of addresses) {
    const k = key(a);
    if (k === null) continue;
    const ids = groups.get(k);
    if (ids) ids.push(a.id);
    else groups.set(k, [a.id]);
  }
  return recordCheck(id, label, description, addresses, (a) => {
    const k = key(a);
    if (k === null) return null;
    const ids = groups.get(k)!;
    return ids.length > 1
      ? `shared with row${ids.length > 2 ? "s" : ""} ${ids.filter((x) => x !== a.id).join(", ")}`
      : true;
  });
}

export function checkDuplicateAddresses(addresses: readonly MockAddress[]): RecordCheck {
  return duplicates(
    "no-duplicate-addresses",
    "No duplicate addresses",
    "No two rows share a full address. The generator draws with replacement from 999 numbers and 49 streets per suburb, so a large set can repeat one by chance.",
    addresses,
    (a) => a.full_address,
  );
}

export function checkDuplicateCoordinates(
  addresses: readonly MockAddress[],
): RecordCheck {
  return duplicates(
    "no-duplicate-coordinates",
    "No duplicate coordinates",
    "No two rows share a latitude and longitude.",
    addresses,
    (a) => (hasPoint(a) ? `${a.latitude},${a.longitude}` : null),
  );
}

/* ---------------------------------------------------------------------------
 * All of them
 * ------------------------------------------------------------------------- */

export function runRecordChecks(
  addresses: readonly MockAddress[],
  byCode: SuburbsByCode,
  index: GeometryIndex,
): RecordCheck[] {
  return [
    checkRequiredFields(addresses),
    checkMockStamp(addresses),
    checkAddressFormat(addresses),
    checkStreetNumber(addresses),
    checkStreetName(addresses),
    checkStateIsSA(addresses),
    checkPostcodeRange(addresses),
    checkSuburbInReference(addresses, byCode),
    checkPostcodeMatchesSuburb(addresses, byCode),
    checkCouncilMatches(addresses, byCode),
    checkRemotenessMatches(addresses, byCode),
    checkIrsadMatches(addresses, byCode),
    checkPointInSuburb(addresses, index, byCode),
    checkPointInSouthAustralia(addresses, index),
    checkDuplicateAddresses(addresses),
    checkDuplicateCoordinates(addresses),
  ];
}
