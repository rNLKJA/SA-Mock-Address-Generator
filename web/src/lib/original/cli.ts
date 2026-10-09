/**
 * Port of original/cli.py: reproduces the exact stdout/stderr of the `generate`
 * and `options` commands (the `lookup` command needs a Mapbox key and is
 * replaced by the Photon-based lookup page).
 */
import { NumpyLegacyRandomState } from "@/lib/rng/numpy-legacy";
import { PythonRandom } from "@/lib/rng/python-random";
import {
  SAAddressLookupPort,
  type DistributionType,
  type OriginalAddress,
  type OriginalRow,
} from "./lookup";

export type CliFormat = "default" | "json" | "csv";

export interface GenerateArgs {
  count: number;
  format: CliFormat;
  suburb?: string;
  council?: string;
  remoteness?: string;
  /** argparse restricts this to 0-5. */
  socioeconomic?: number;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  addresses: OriginalAddress[];
}

const NO_KEY_WARNING =
  "Warning: No Mapbox API key provided. Address lookup functionality will be limited.";

/** `json.dumps(value, indent=2)` with Python's default `ensure_ascii=True`. */
export function pyJsonDumps(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

class Printer {
  lines: string[] = [];
  print(line = ""): void {
    this.lines.push(line);
  }
  toString(): string {
    return this.lines.length ? `${this.lines.join("\n")}\n` : "";
  }
}

function printAddress(
  out: Printer,
  address: OriginalAddress,
  format: CliFormat,
  csvState: { headerPrinted: boolean },
): void {
  if (format === "json") {
    out.print(pyJsonDumps(address));
  } else if (format === "csv") {
    if (!csvState.headerPrinted) {
      out.print(Object.keys(address).join(","));
      csvState.headerPrinted = true;
    }
    const values = Object.values(address).map((v) => (v === null ? "" : String(v)));
    out.print(values.map((v) => `"${v}"`).join(","));
  } else {
    out.print(`Address: ${address.full_address}`);
    out.print(`Street: ${address.street_address}`);
    out.print(`Suburb: ${address.suburb}`);
    out.print(`Postcode: ${address.postcode}`);
    out.print(`Council: ${address.council}`);
    if (address.latitude && address.longitude) {
      out.print(`Coordinates: ${address.latitude}, ${address.longitude}`);
    }
    out.print(`Remoteness: ${address.remoteness_level}`);
    out.print(`Socio-economic level: ${address.socio_economic_status}`);
  }
}

/** Mirrors the if/elif chain in `generate_addresses` (truthiness included). */
export function resolveDistribution(args: GenerateArgs): {
  type: DistributionType;
  value: string | null;
} {
  if (args.suburb) return { type: "suburb", value: args.suburb };
  if (args.council) return { type: "council", value: args.council };
  if (args.remoteness) return { type: "remoteness", value: args.remoteness };
  // `elif args.socioeconomic:` is falsy for 0, so `--socioeconomic 0` means no filter.
  if (args.socioeconomic)
    return { type: "socioeconomic", value: String(args.socioeconomic) };
  return { type: "default", value: null };
}

/** Seed both generators the way scripts/replay_original.py does. */
export function seededLookup(
  rows: readonly OriginalRow[],
  seed: number,
): SAAddressLookupPort {
  return new SAAddressLookupPort(
    rows,
    new PythonRandom(seed),
    new NumpyLegacyRandomState(seed),
  );
}

export function runGenerate(
  rows: readonly OriginalRow[],
  seed: number,
  args: GenerateArgs,
): CliResult {
  if (args.count <= 0) {
    return {
      stdout: "",
      stderr: "Error: Count must be a positive number\n",
      exitCode: 1,
      addresses: [],
    };
  }
  const out = new Printer();
  const lookup = seededLookup(rows, seed);
  out.print(NO_KEY_WARNING);

  const { type, value } = resolveDistribution(args);
  const count = args.count;
  out.print(`Generating ${count} South Australian address${count > 1 ? "es" : ""}...`);
  if (type !== "default") out.print(`Filtering by ${type}: ${value}`);
  out.print();

  const csvState = { headerPrinted: false };
  const addresses: OriginalAddress[] = [];
  for (let i = 0; i < count; i++) {
    const address = lookup.generateRandomAddress(type, value);
    addresses.push(address);
    if (count > 1 && args.format === "default") out.print(`=== Address ${i + 1} ===`);
    printAddress(out, address, args.format, csvState);
    if (count > 1 && args.format === "default") out.print();
  }
  return { stdout: out.toString(), stderr: "", exitCode: 0, addresses };
}

export function runOptions(rows: readonly OriginalRow[], format: CliFormat): CliResult {
  const out = new Printer();
  const lookup = seededLookup(rows, 0);
  out.print(NO_KEY_WARNING);
  const options = lookup.getAvailableOptions();
  if (format === "json") {
    out.print(pyJsonDumps(options));
  } else {
    out.print("Available Distribution Options:");
    out.print("=".repeat(40));
    out.print(`\nSuburbs (${options.suburbs.length}):`);
    for (const s of options.suburbs) out.print(`  - ${s}`);
    out.print(`\nCouncils (${options.councils.length}):`);
    for (const c of options.councils) out.print(`  - ${c}`);
    out.print(`\nRemoteness Levels:`);
    for (const r of options.remoteness_levels) out.print(`  - ${r}`);
    out.print(`\nSocio-economic Levels:`);
    for (const l of options.socioeconomic_levels) out.print(`  - ${l}`);
  }
  return { stdout: out.toString(), stderr: "", exitCode: 0, addresses: [] };
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** argv for original/cli.py, in the order argparse expects (`--format` first). */
export function toArgv(args: GenerateArgs): string[] {
  const argv: string[] = [];
  if (args.format !== "default") argv.push("--format", args.format);
  argv.push("generate", String(args.count));
  if (args.suburb) argv.push("--suburb", args.suburb);
  else if (args.council) argv.push("--council", args.council);
  else if (args.remoteness) argv.push("--remoteness", args.remoteness);
  else if (args.socioeconomic !== undefined)
    argv.push("--socioeconomic", String(args.socioeconomic));
  return argv;
}

/** The command that reproduces a replay byte for byte with the real Python. */
export function replayCommand(seed: number, argv: string[]): string {
  return `uv run scripts/replay_original.py --seed ${seed} -- ${argv.map(shellQuote).join(" ")}`;
}
