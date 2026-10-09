import { describe, expect, it } from "vitest";
import { GeometryIndex } from "@/lib/geo";
import { STREET_NAMES } from "@/lib/original/lookup";
import { chiSquareGoodnessOfFit } from "@/lib/stats";
import { salGeojson, suburbsJson } from "@/lib/test-utils/data";
import { RA_NAMES } from "@/lib/suburbs";
import {
  CumulativeSampler,
  generateMockAddresses,
  type GenerateOptions,
} from "./generate";
import { csvField, toCsv, toJson, toText } from "./format";
import {
  CONFIG_REMOTENESS_WEIGHTS,
  bandForDecile,
  configDecileWeights,
  configRemotenessWeights,
  defaultWeights,
  eligibleIndices,
  samplingProbabilities,
} from "./weights";

const rows = suburbsJson.rows;
const index = new GeometryIndex(salGeojson);
const base: GenerateOptions = {
  count: 200,
  seed: 42,
  mode: "uniform",
  filters: {},
  weights: defaultWeights(),
  coordinates: true,
};

describe("rebuilt suburb table", () => {
  it("has every SA suburb with a padded postcode, council and remoteness", () => {
    expect(rows.length).toBeGreaterThan(1600);
    for (const r of rows) {
      expect(r.postcode).toMatch(/^\d{4}$/);
      expect(r.council.length).toBeGreaterThan(0);
      expect(r.ra).toBeGreaterThanOrEqual(0);
      expect(r.ra).toBeLessThanOrEqual(4);
    }
    const amata = rows.find((r) => r.name === "AMATA")!;
    expect(amata.postcode).toBe("0872");
    expect(rows.find((r) => r.name === "ADELAIDE")!.postcode).toBe("5000");
  });
});

describe("weights from config.py", () => {
  it("keeps the remoteness weights verbatim", () => {
    expect(configRemotenessWeights()).toEqual([0.4, 0.25, 0.2, 0.1, 0.05]);
    expect(CONFIG_REMOTENESS_WEIGHTS["Not Applicable"]).toBe(0);
  });

  it("spreads the six socio-economic bands over ten deciles, preserving band totals", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(bandForDecile)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    const w = configDecileWeights();
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(w[0]).toBeCloseTo(0.05);
    expect(w[9]).toBeCloseTo(0.15);
    expect(w[1] + w[2]).toBeCloseTo(0.1);
  });
});

describe("filters", () => {
  it("combines filters with AND and skips non-addressable SALs", () => {
    const all = eligibleIndices(rows, {});
    expect(all.length).toBe(rows.filter((r) => r.addressable).length);
    expect(all.some((i) => rows[i].name === "SA REMAINDER")).toBe(false);
    const adelaide = eligibleIndices(rows, { council: "adelaide" });
    expect(adelaide.map((i) => rows[i].name).sort()).toEqual([
      "ADELAIDE",
      "NORTH ADELAIDE",
    ]);
    expect(eligibleIndices(rows, { council: "Adelaide", ra: 4 })).toEqual([]);
    expect(eligibleIndices(rows, { suburb: "glenelg" }).length).toBe(1);
  });
});

describe("sampling probabilities", () => {
  it("are uniform over eligible suburbs in uniform mode", () => {
    const { probs, eligible } = samplingProbabilities(rows, {}, "uniform");
    const nonzero = Array.from(probs).filter((p) => p > 0);
    expect(nonzero.length).toBe(eligible);
    expect(nonzero.every((p) => Math.abs(p - 1 / eligible) < 1e-15)).toBe(true);
  });

  it("hit the config.py remoteness shares exactly", () => {
    const { probs } = samplingProbabilities(rows, {}, "remoteness");
    const share = [0, 0, 0, 0, 0];
    rows.forEach((r, i) => (share[r.ra] += probs[i]));
    share.forEach((s, k) => expect(s).toBeCloseTo(configRemotenessWeights()[k], 12));
  });

  it("renormalise when a filter removes categories", () => {
    const { probs } = samplingProbabilities(
      rows,
      { council: "Unincorporated SA" },
      "remoteness",
    );
    const total = Array.from(probs).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("give suburbs without a SEIFA decile zero weight in SEIFA mode", () => {
    const res = samplingProbabilities(rows, {}, "seifa");
    rows.forEach((r, i) => {
      if (r.decileSa === null) expect(res.probs[i]).toBe(0);
    });
    expect(res.zeroWeight).toBeGreaterThan(0);
  });

  it("follow population in population mode", () => {
    const { probs } = samplingProbabilities(rows, {}, "population");
    const adelaide = rows.findIndex((r) => r.name === "ADELAIDE");
    const total = rows.filter((r) => r.addressable).reduce((s, r) => s + r.pop, 0);
    expect(probs[adelaide]).toBeCloseTo(rows[adelaide].pop / total, 15);
  });

  it("report an error instead of silently falling back", () => {
    expect(samplingProbabilities(rows, { suburb: "NOWHERE" }, "uniform").error).toMatch(
      /No suburb/,
    );
    const zero = { remoteness: [0, 0, 0, 0, 0], decile: defaultWeights().decile };
    expect(samplingProbabilities(rows, {}, "remoteness", zero).error).toMatch(/zero/);
  });
});

describe("CumulativeSampler", () => {
  it("maps u to the right bucket", () => {
    const s = new CumulativeSampler(Float64Array.from([0, 0.25, 0, 0.75]));
    expect(s.size).toBe(2);
    expect(s.sample(0)).toBe(1);
    expect(s.sample(0.2499)).toBe(1);
    expect(s.sample(0.25)).toBe(3);
    expect(s.sample(0.9999999)).toBe(3);
  });
});

describe("generateMockAddresses", () => {
  it("is deterministic for a seed and keeps the original address recipe", () => {
    const a = generateMockAddresses(rows, index, base);
    const b = generateMockAddresses(rows, index, base);
    expect(a.addresses).toEqual(b.addresses);
    expect(a.addresses).toHaveLength(200);
    for (const x of a.addresses) {
      expect(x.full_address).toBe(
        `${x.street_number} ${x.street_name}, ${x.suburb} SA ${x.postcode}`,
      );
      expect(x.full_address).toMatch(/^\d{1,3} .+, .+ SA \d{4}$/);
      expect(STREET_NAMES).toContain(x.street_name);
      expect(x.stamp).toBe("MOCK: synthetic test data");
      expect(index.locate([x.longitude!, x.latitude!])).toBe(x.sal_code);
    }
    expect(
      generateMockAddresses(rows, index, { ...base, seed: 43 }).addresses,
    ).not.toEqual(a.addresses);
  });

  it("omits coordinates when asked", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      coordinates: false,
      count: 5,
    });
    expect(r.addresses.every((x) => x.latitude === null && x.longitude === null)).toBe(
      true,
    );
  });

  it("caps the count at 5,000", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      coordinates: false,
      count: 9000,
    });
    expect(r.addresses).toHaveLength(5000);
  });

  it("produces remoteness shares consistent with the config.py target", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      mode: "remoteness",
      count: 5000,
      coordinates: false,
    });
    const gof = chiSquareGoodnessOfFit(r.observed.remoteness, r.expected.remoteness)!;
    expect(gof.pValue).toBeGreaterThan(0.001);
    r.expected.remoteness.forEach((p, k) =>
      expect(p).toBeCloseTo(configRemotenessWeights()[k], 12),
    );
    expect(r.observed.remoteness.reduce((a, b) => a + b, 0)).toBe(5000);
  });

  it("shows why weighting matters: uniform mode misses the config.py target", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      count: 5000,
      coordinates: false,
    });
    const gof = chiSquareGoodnessOfFit(r.observed.remoteness, configRemotenessWeights())!;
    expect(gof.pValue).toBeLessThan(1e-6);
  });
});

describe("output formats", () => {
  const { addresses } = generateMockAddresses(rows, index, { ...base, count: 3 });

  it("quotes CSV fields per RFC 4180", () => {
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField(null)).toBe("");
    const csv = toCsv(addresses).trim().split("\r\n");
    expect(csv[0].startsWith("id,stamp,full_address")).toBe(true);
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain("MOCK: synthetic test data");
  });

  it("stamps JSON and text output", () => {
    const json = JSON.parse(toJson(addresses, base));
    expect(json.stamp).toBe("MOCK: synthetic test data");
    expect(json.addresses).toHaveLength(3);
    const text = toText(addresses);
    expect(text.startsWith("# MOCK: synthetic test data.")).toBe(true);
    expect(text).toContain("=== Address 1 [MOCK] ===");
    expect(text).toContain(`Remoteness: ${RA_NAMES[0]}`.slice(0, 11));
  });
});
