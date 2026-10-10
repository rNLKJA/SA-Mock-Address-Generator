/**
 * CSV parser for the site's export format.
 */
import type { MockAddress } from "@/lib/generator/generate";
import { CSV_COLUMNS } from "@/lib/generator/format";
import { MOCK_STAMP } from "@/lib/suburbs";

export interface ParseResult {
  addresses: MockAddress[];
  errors: string[];
}

/** Parse CSV in the site's format: header row with CSV_COLUMNS, RFC 4180 quoting. */
export function parseAddressesCSV(csv: string): ParseResult {
  const errors: string[] = [];
  const addresses: MockAddress[] = [];

  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length === 0) {
    errors.push("CSV is empty.");
    return { addresses, errors };
  }

  const header = parseCSVLine(lines[0]);
  // Validate header matches expected columns
  if (header.length !== CSV_COLUMNS.length) {
    errors.push(
      `Expected ${CSV_COLUMNS.length} columns, got ${header.length}. ` +
        `Expected: ${CSV_COLUMNS.join(", ")}`,
    );
    return { addresses, errors };
  }

  for (let i = 0; i < CSV_COLUMNS.length; i++) {
    if (header[i] !== CSV_COLUMNS[i]) {
      errors.push(`Column ${i + 1}: expected "${CSV_COLUMNS[i]}", got "${header[i]}".`);
    }
  }

  if (errors.length > 0) {
    return { addresses, errors };
  }

  // Parse data rows
  for (let rowNum = 1; rowNum < lines.length; rowNum++) {
    const fields = parseCSVLine(lines[rowNum]);
    if (fields.length !== CSV_COLUMNS.length) {
      errors.push(
        `Row ${rowNum + 1}: expected ${CSV_COLUMNS.length} fields, got ${fields.length}.`,
      );
      continue;
    }
    const id = wholeNumber(fields[0]);
    if (id === null || id < 1) {
      errors.push(`Row ${rowNum + 1}: invalid id "${fields[0]}".`);
      continue;
    }
    // Other malformed values are kept (as NaN) so the record checks can
    // report them against the row, instead of the whole file being rejected.
    addresses.push({
      id,
      stamp: fields[1] as typeof MOCK_STAMP,
      full_address: fields[2],
      street_address: fields[3],
      street_number: numberOrNaN(fields[4]),
      street_name: fields[5],
      suburb: fields[6],
      postcode: fields[7],
      council: fields[8],
      remoteness_level: fields[9],
      seifa_decile_sa: fields[10].trim() ? numberOrNaN(fields[10]) : null,
      latitude: fields[11].trim() ? numberOrNaN(fields[11]) : null,
      longitude: fields[12].trim() ? numberOrNaN(fields[12]) : null,
      sal_code: fields[13],
    });
  }

  return { addresses, errors };
}

function wholeNumber(field: string): number | null {
  return /^\s*\d+\s*$/.test(field) ? Number(field) : null;
}

function numberOrNaN(field: string): number {
  return field.trim() === "" ? Number.NaN : Number(field);
}

/** Parse a single CSV line with RFC 4180 quoting and backslash-escaped commas. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check if it's an escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++; // Skip the next quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "\\" && i + 1 < line.length && line[i + 1] === ",") {
        // Handle backslash-escaped comma
        field += ",";
        i++; // Skip the comma
      } else if (char === ",") {
        result.push(field);
        field = "";
      } else {
        field += char;
      }
    }
  }

  result.push(field);
  return result;
}
