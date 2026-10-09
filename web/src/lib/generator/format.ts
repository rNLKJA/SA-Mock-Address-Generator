/**
 * Output formats for generated addresses. Every format carries the MOCK stamp.
 */
import { MOCK_STAMP } from "@/lib/suburbs";
import type { GenerateOptions, MockAddress } from "./generate";

export type OutputFormat = "text" | "json" | "csv";

export const NOTICE =
  "Synthetic test data. A generated address may coincide with a real one by chance: do not use it for mail, identity, or to stand in for a real person.";

export const CSV_COLUMNS: (keyof MockAddress)[] = [
  "id",
  "stamp",
  "full_address",
  "street_address",
  "street_number",
  "street_name",
  "suburb",
  "postcode",
  "council",
  "remoteness_level",
  "seifa_decile_sa",
  "latitude",
  "longitude",
  "sal_code",
];

/** RFC 4180 field quoting. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(addresses: readonly MockAddress[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const a of addresses) lines.push(CSV_COLUMNS.map((c) => csvField(a[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function toJson(
  addresses: readonly MockAddress[],
  options: Pick<GenerateOptions, "seed" | "mode" | "filters" | "coordinates">,
): string {
  return `${JSON.stringify(
    {
      stamp: MOCK_STAMP,
      notice: NOTICE,
      generator: "SA Mock Address Lab (revival of SA Mock Address Generator, 2025)",
      settings: options,
      count: addresses.length,
      addresses,
    },
    null,
    2,
  )}\n`;
}

/** Human-readable blocks in the style of the original CLI's default output. */
export function toText(addresses: readonly MockAddress[]): string {
  const out: string[] = [`# ${MOCK_STAMP}. ${NOTICE}`, ""];
  for (const a of addresses) {
    out.push(`=== Address ${a.id} [MOCK] ===`);
    out.push(`Address: ${a.full_address}`);
    out.push(`Street: ${a.street_address}`);
    out.push(`Suburb: ${a.suburb}`);
    out.push(`Postcode: ${a.postcode}`);
    out.push(`Council: ${a.council}`);
    if (a.latitude !== null && a.longitude !== null) {
      out.push(`Coordinates: ${a.latitude}, ${a.longitude}`);
    }
    out.push(`Remoteness: ${a.remoteness_level}`);
    out.push(`SEIFA IRSAD decile (SA): ${a.seifa_decile_sa ?? "not published"}`);
    out.push("");
  }
  return `${out.join("\n")}`;
}

export function formatAddresses(
  addresses: readonly MockAddress[],
  format: OutputFormat,
  options: Pick<GenerateOptions, "seed" | "mode" | "filters" | "coordinates">,
): string {
  if (format === "csv") return toCsv(addresses);
  if (format === "json") return toJson(addresses, options);
  return toText(addresses);
}

export const MIME: Record<OutputFormat, string> = {
  text: "text/plain;charset=utf-8",
  json: "application/json;charset=utf-8",
  csv: "text/csv;charset=utf-8",
};

export const EXTENSION: Record<OutputFormat, string> = {
  text: "txt",
  json: "json",
  csv: "csv",
};
