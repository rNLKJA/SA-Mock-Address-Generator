/**
 * Faithful TypeScript port of `SAAddressLookup` from original/sa_address_lookup.py
 * (generation only). The Mapbox calls are not ported: without a key the original
 * returns `None` for coordinates, and that is what this port reproduces.
 *
 * Quirks preserved on purpose, because this module exists to replay the 2025 code:
 *  - one filter at a time, compared case-insensitively;
 *  - an empty filter result silently falls back to every suburb;
 *  - `socioeconomic` filters on a column that is 0 for every row;
 *  - postcodes are integers, so `0872` prints as `872`;
 *  - the suburb is drawn with NumPy's legacy RNG (pandas `sample`), the street
 *    number and name with Python's `random`.
 */
import type { NumpyLegacyRandomState } from "@/lib/rng/numpy-legacy";
import type { PythonRandom } from "@/lib/rng/python-random";

export interface OriginalRow {
  Suburb: string;
  Postcode: number;
  Council: string;
  SocioEconomicStatus: number;
  "Remoteness Level": string;
}

export interface OriginalTableJson {
  columns: string[];
  rows: [string, number, string, number, string][];
}

export type DistributionType =
  "default" | "suburb" | "council" | "remoteness" | "socioeconomic";

/** Key order matches the Python dict, which matters for JSON and CSV output. */
export interface OriginalAddress {
  street_address: string;
  street_number: number;
  street_name: string;
  suburb: string;
  postcode: number;
  full_address: string;
  council: string;
  latitude: number | null;
  longitude: number | null;
  socio_economic_status: number;
  remoteness_level: string;
}

export interface OriginalOptions {
  suburbs: string[];
  councils: string[];
  remoteness_levels: string[];
  socioeconomic_levels: number[];
}

/** The 49 street names hard-coded in `_generate_street_name`, in order. */
export const STREET_NAMES: readonly string[] = [
  "Main Street",
  "High Street",
  "Church Street",
  "King Street",
  "Queen Street",
  "Victoria Street",
  "George Street",
  "Elizabeth Street",
  "North Terrace",
  "South Terrace",
  "East Terrace",
  "West Terrace",
  "Adelaide Street",
  "Franklin Street",
  "Flinders Street",
  "Hindley Street",
  "Rundle Street",
  "Pulteney Street",
  "Morphett Street",
  "Light Square",
  "Hurtle Square",
  "Wellington Square",
  "Whitmore Square",
  "Palmer Place",
  "Gawler Place",
  "Pirie Street",
  "Waymouth Street",
  "Currie Street",
  "Grenfell Street",
  "Angas Street",
  "Halifax Street",
  "Carrington Street",
  "Prospect Road",
  "Magill Road",
  "Portrush Road",
  "Glen Osmond Road",
  "Unley Road",
  "Goodwood Road",
  "Cross Road",
  "Marion Road",
  "Brighton Road",
  "Henley Beach Road",
  "Port Road",
  "Grand Junction Road",
  "Churchill Road",
  "Torrens Road",
  "Lower North East Road",
  "Upper Sturt Road",
  "Main North Road",
];

/** `_load_suburbs_data`: drop rows without a suburb, upper-case suburb names. */
export function loadOriginalTable(json: OriginalTableJson): OriginalRow[] {
  return json.rows
    .filter(([suburb]) => typeof suburb === "string" && suburb.length > 0)
    .map(([suburb, postcode, council, ses, remoteness]) => ({
      Suburb: suburb.toUpperCase(),
      Postcode: postcode,
      Council: council,
      SocioEconomicStatus: ses,
      "Remoteness Level": remoteness,
    }));
}

/** Python's `int(str)` for the plain decimal strings the CLI produces. */
function pythonInt(value: string): number | null {
  const trimmed = value.trim().replace(/_/g, "");
  return /^[+-]?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

export class SAAddressLookupPort {
  constructor(
    readonly suburbsData: readonly OriginalRow[],
    private readonly py: PythonRandom,
    private readonly np: NumpyLegacyRandomState,
  ) {}

  filterSuburbsByDistribution(
    distributionType: string,
    distributionValue: string | null | undefined,
  ): readonly OriginalRow[] {
    const data = this.suburbsData;
    if (distributionType === "default") return data;
    if (distributionValue === null || distributionValue === undefined) return data;
    const wanted = distributionValue.toUpperCase();
    switch (distributionType) {
      case "suburb":
        return data.filter((r) => r.Suburb.toUpperCase() === wanted);
      case "council":
        return data.filter((r) => r.Council.toUpperCase() === wanted);
      case "remoteness":
        return data.filter((r) => r["Remoteness Level"].toUpperCase() === wanted);
      case "socioeconomic": {
        const level = pythonInt(distributionValue);
        if (level === null) return data;
        return data.filter((r) => r.SocioEconomicStatus === level);
      }
      default:
        return data;
    }
  }

  generateRandomAddress(
    distributionType: string = "default",
    distributionValue: string | null = null,
  ): OriginalAddress {
    if (this.suburbsData.length === 0) {
      throw new Error("No suburb data available for address generation");
    }
    let filtered = this.filterSuburbsByDistribution(distributionType, distributionValue);
    if (filtered.length === 0) filtered = this.suburbsData;

    // filtered_suburbs.sample(n=1).iloc[0]
    const [index] = this.np.choiceWithoutReplacement(filtered.length, 1);
    const info = filtered[index];

    const streetNumber = this.py.randint(1, 999);
    const streetName = this.py.choice(STREET_NAMES);
    const streetAddress = `${streetNumber} ${streetName}`;

    return {
      street_address: streetAddress,
      street_number: streetNumber,
      street_name: streetName,
      suburb: info.Suburb,
      postcode: info.Postcode,
      full_address: `${streetAddress}, ${info.Suburb} SA ${info.Postcode}`,
      council: info.Council,
      latitude: null,
      longitude: null,
      socio_economic_status: info.SocioEconomicStatus,
      remoteness_level: info["Remoteness Level"],
    };
  }

  getAvailableOptions(): OriginalOptions {
    const uniqueSorted = <T extends string | number>(values: T[]): T[] =>
      Array.from(new Set(values)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const data = this.suburbsData;
    return {
      suburbs: uniqueSorted(data.map((r) => r.Suburb)),
      councils: uniqueSorted(data.map((r) => r.Council)),
      remoteness_levels: uniqueSorted(data.map((r) => r["Remoteness Level"])),
      socioeconomic_levels: uniqueSorted(data.map((r) => r.SocioEconomicStatus)),
    };
  }
}
