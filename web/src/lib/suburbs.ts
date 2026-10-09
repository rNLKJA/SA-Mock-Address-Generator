/**
 * Types and constants for the rebuilt suburb table (web/public/data/suburbs.json),
 * produced by scripts/build_data.py from ABS open data.
 */

export const RA_NAMES = [
  "Major Cities of Australia",
  "Inner Regional Australia",
  "Outer Regional Australia",
  "Remote Australia",
  "Very Remote Australia",
] as const;

export const RA_SHORT = [
  "Major Cities",
  "Inner Regional",
  "Outer Regional",
  "Remote",
  "Very Remote",
] as const;

export type RaIndex = 0 | 1 | 2 | 3 | 4;

export const DECILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface Suburb {
  /** ABS SAL 2021 code, e.g. "40002". */
  code: string;
  /** Upper-case display name with the " (SA)" disambiguator removed. */
  name: string;
  /** Official ABS SAL name. */
  official: string;
  /** Majority-population ABS Postal Area, always four digits. */
  postcode: string;
  postcodes: string[];
  council: string;
  lgaCode: string;
  ra: RaIndex;
  raShare: number;
  /** IRSAD decile ranked within South Australia (null when ABS publishes none). */
  decileSa: number | null;
  decileAus: number | null;
  irsad: number | null;
  pop: number;
  areaKm2: number;
  /** A point guaranteed inside the simplified boundary: [lon, lat]. */
  label: [number, number];
  addressable: boolean;
}

export interface SuburbsJson {
  meta: {
    generated: string;
    method: string;
    raNames: string[];
    licence: string;
  };
  rows: Suburb[];
}

export const MOCK_STAMP = "MOCK: synthetic test data";

export function formatFullAddress(
  streetNumber: number,
  streetName: string,
  suburb: string,
  postcode: string | number,
): string {
  return `${streetNumber} ${streetName}, ${suburb} SA ${postcode}`;
}

/** Official SAL name without the " (SA)" state disambiguator, e.g. "Glenelg". */
export function displayName(s: Pick<Suburb, "official">): string {
  return s.official.replace(/\s*\(SA\)$/, "");
}

/** "Major Cities of Australia" -> "Major Cities". */
export function shortRemoteness(name: string): string {
  const i = (RA_NAMES as readonly string[]).indexOf(name);
  return i >= 0 ? RA_SHORT[i] : name;
}
