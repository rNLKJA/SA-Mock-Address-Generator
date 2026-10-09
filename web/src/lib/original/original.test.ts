import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "@/lib/__fixtures__/original-parity.json";
import {
  pyJsonDumps,
  resolveDistribution,
  runGenerate,
  runOptions,
  seededLookup,
  toArgv,
} from "./cli";
import type { CliFormat, GenerateArgs } from "./cli";
import { loadOriginalTable, STREET_NAMES, type OriginalTableJson } from "./lookup";

const table = JSON.parse(
  readFileSync(
    new URL("../../../public/data/original-suburbs.json", import.meta.url),
    "utf8",
  ),
) as OriginalTableJson;
const rows = loadOriginalTable(table);

/** Turn a recorded argv back into GenerateArgs (only the flags the fixtures use). */
function parseArgv(argv: string[]): {
  command: string;
  format: CliFormat;
  args?: GenerateArgs;
} {
  let format: CliFormat = "default";
  let i = 0;
  if (argv[0] === "--format") {
    format = argv[1] as CliFormat;
    i = 2;
  }
  const command = argv[i];
  if (command !== "generate") return { command, format };
  const args: GenerateArgs = { count: Number(argv[i + 1]), format };
  for (let j = i + 2; j < argv.length; j += 2) {
    const flag = argv[j].replace(/^--/, "");
    const value = argv[j + 1];
    if (flag === "socioeconomic") args.socioeconomic = Number(value);
    else (args as unknown as Record<string, string>)[flag] = value;
  }
  return { command, format, args };
}

describe("original table", () => {
  it("loads all 1,894 rows with the 2025 quirks intact", () => {
    expect(rows).toHaveLength(1894);
    expect(rows.every((r) => r.SocioEconomicStatus === 0)).toBe(true);
    expect(rows.filter((r) => r["Remoteness Level"] === "Not Applicable")).toHaveLength(
      997,
    );
    expect(rows.filter((r) => r.Postcode === 872)).toHaveLength(19);
  });

  it("keeps the 49 hard-coded street names", () => {
    expect(STREET_NAMES).toHaveLength(49);
    expect(new Set(STREET_NAMES).size).toBe(49);
  });
});

describe("SAAddressLookup port reproduces the Python generator", () => {
  for (const c of fixture.generate) {
    it(`seed ${c.seed}, ${c.type}=${c.value ?? "-"}`, () => {
      const lookup = seededLookup(rows, c.seed);
      const got = c.addresses.map(() => lookup.generateRandomAddress(c.type, c.value));
      expect(got).toEqual(c.addresses);
    });
  }

  it("formats addresses as 'N Street, SUBURB SA PPPP'", () => {
    const lookup = seededLookup(rows, 99);
    for (let i = 0; i < 50; i++) {
      const a = lookup.generateRandomAddress();
      expect(a.full_address).toMatch(/^\d{1,3} [A-Za-z ]+, [A-Z0-9 '()-]+ SA \d{3,4}$/);
      expect(a.street_number).toBeGreaterThanOrEqual(1);
      expect(a.street_number).toBeLessThanOrEqual(999);
    }
  });

  it("filters case-insensitively and falls back to all suburbs when empty", () => {
    const lookup = seededLookup(rows, 1);
    expect(
      lookup.filterSuburbsByDistribution("council", "city of adelaide"),
    ).toHaveLength(2);
    expect(lookup.filterSuburbsByDistribution("suburb", "nowhere")).toHaveLength(0);
    expect(lookup.filterSuburbsByDistribution("socioeconomic", "5")).toHaveLength(0);
    expect(lookup.filterSuburbsByDistribution("socioeconomic", "0")).toHaveLength(1894);
    expect(lookup.filterSuburbsByDistribution("socioeconomic", "high")).toHaveLength(
      1894,
    );
    expect(lookup.filterSuburbsByDistribution("remoteness", null)).toHaveLength(1894);
  });

  it("matches get_available_options", () => {
    const options = seededLookup(rows, 0).getAvailableOptions();
    expect({
      suburbs: options.suburbs.length,
      councils: options.councils.length,
      remoteness_levels: options.remoteness_levels.length,
      socioeconomic_levels: options.socioeconomic_levels.length,
    }).toEqual(fixture.options.counts);
    expect(options.remoteness_levels).toEqual(fixture.options.remoteness_levels);
    expect(options.socioeconomic_levels).toEqual(fixture.options.socioeconomic_levels);
    expect(options.suburbs.slice(0, 5)).toEqual(fixture.options.head.suburbs);
  });
});

describe("cli.py port prints the same bytes as the Python CLI", () => {
  for (const c of fixture.cli) {
    it(`seed ${c.seed}: cli.py ${c.argv.join(" ")}`, () => {
      const parsed = parseArgv(c.argv);
      const result =
        parsed.command === "options"
          ? runOptions(rows, parsed.format)
          : runGenerate(rows, c.seed, parsed.args!);
      expect(result.stdout).toBe(c.stdout);
      expect(result.stderr).toBe(c.stderr);
      expect(result.exitCode).toBe(c.exitCode);
    });
  }

  it("treats --socioeconomic 0 as no filter, like the original elif chain", () => {
    expect(
      resolveDistribution({ count: 1, format: "default", socioeconomic: 0 }),
    ).toEqual({
      type: "default",
      value: null,
    });
  });

  it("builds argv with --format before the subcommand", () => {
    expect(toArgv({ count: 3, format: "json", council: "CITY OF ADELAIDE" })).toEqual([
      "--format",
      "json",
      "generate",
      "3",
      "--council",
      "CITY OF ADELAIDE",
    ]);
  });

  it("escapes non-ASCII like json.dumps", () => {
    expect(pyJsonDumps({ s: "Café" })).toBe('{\n  "s": "Caf\\u00e9"\n}');
  });
});
