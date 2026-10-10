import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/generator/format";
import { MOCK_STAMP } from "@/lib/suburbs";
import { asSuburb, ctx, generated, options, rows } from "@/lib/test-utils/verification";
import { parseAddressesCSV } from "./csv-parser";
import {
  generateJSONReport,
  generateMarkdownReport,
  overallPassed,
  settingsLine,
} from "./report";
import type { VerificationResult } from "./types";
import { canonicalCsvText, verifyCsv, verifyHandoff } from "./verify";

const SET_CHECKS = [
  "distribution-remoteness",
  "distribution-decile",
  "spatial-spread",
  "reproducibility",
];

function statuses(r: VerificationResult) {
  return Object.fromEntries(r.setChecks.map((c) => [c.id, c.status]));
}

describe("verifying the run carried over from /generate", () => {
  it("regenerates the default run and passes every check", async () => {
    const r = await verifyHandoff(ctx, options({ count: 25 }));
    expect(r.source).toBe("generate");
    expect(r.seed).toBe(2025);
    expect(r.count).toBe(25);
    expect(r.recordChecks).toHaveLength(16);
    expect(r.totalFailedRows).toBe(0);
    expect(r.setChecks.map((c) => c.id)).toEqual(SET_CHECKS);
    expect(statuses(r)).toEqual({
      "distribution-remoteness": "pass",
      "distribution-decile": "pass",
      "spatial-spread": "pass",
      reproducibility: "pass",
    });
    expect(overallPassed(r)).toBe(true);
    expect(r.spotSample).toHaveLength(10);
    // the set checked is the generator's set, row for row
    const repro = r.setChecks.find((c) => c.kind === "reproducibility")!;
    if (repro.kind !== "reproducibility") throw new Error();
    const csv = toCsv(generated({ count: 25 }));
    expect(repro.details!.bytesA).toBe(new TextEncoder().encode(csv).length);
    expect(repro.details!.compared).toBe("regenerated-twice");
  });

  it("checks a stratified run against its quotas", async () => {
    const r = await verifyHandoff(
      ctx,
      options({ count: 40, mode: "stratified", seed: 3 }),
    );
    const ra = r.setChecks.find((c) => c.id === "distribution-remoteness")!;
    if (ra.kind !== "distribution") throw new Error();
    expect(ra.status).toBe("pass");
    expect(ra.details!.quotas).not.toBeNull();
    expect(ra.details!.quotas!.reduce((a, b) => a + b, 0)).toBe(40);
  });

  it("checks a filtered run against the filtered design", async () => {
    const r = await verifyHandoff(
      ctx,
      options({ count: 30, filters: { council: "Holdfast Bay" } }),
    );
    expect(r.totalFailedRows).toBe(0);
    const dec = r.setChecks.find((c) => c.id === "distribution-decile")!;
    expect(dec.status).not.toBe("fail");
  });

  it("runs without coordinates, the spatial check then not applying", async () => {
    const r = await verifyHandoff(ctx, options({ count: 50, coordinates: false }));
    expect(r.totalFailedRows).toBe(0);
    expect(statuses(r)["spatial-spread"]).toBe("not-run");
    expect(r.spotSample).toEqual([]);
  });

  it("reports a filter that matches nothing", async () => {
    await expect(
      verifyHandoff(ctx, options({ filters: { suburb: "ATLANTIS" } })),
    ).rejects.toThrow("No suburb matches");
  });
});

describe("the statistical checks as one family", () => {
  it("adjust the p-values with Holm's method, so one chance low p does not fail an honest set", async () => {
    // Seed 31, n = 120: the decile test alone gives p = 0.026, a 1-in-20 false alarm.
    const r = await verifyHandoff(ctx, options({ count: 120, seed: 31 }));
    const dec = r.setChecks.find((c) => c.id === "distribution-decile")!;
    if (dec.kind !== "distribution") throw new Error();
    expect(dec.details!.test!.pValue).toBeLessThan(0.05);
    expect(dec.details!.holm!.tests).toBe(3);
    expect(dec.details!.holm!.pAdjusted).toBeCloseTo(3 * dec.details!.test!.pValue, 12);
    expect(dec.status).toBe("pass");
    expect(dec.summary).toContain("Holm-adjusted p = 0.0");
    expect(overallPassed(r)).toBe(true);
  });

  it("fail an honest set about 1 time in 20 or less (60 seeds)", async () => {
    let failed = 0;
    for (let seed = 500; seed < 560; seed++) {
      const r = await verifyHandoff(ctx, options({ count: 80, seed }), {
        spatialReplicates: 99,
      });
      if (r.setChecks.some((c) => c.status === "fail")) failed++;
    }
    // Binomial(60, 0.05) has mean 3: 8 or more happens about 0.4% of the time.
    expect(failed).toBeLessThanOrEqual(7);
  });

  it("leave fixed quotas out of the family", async () => {
    const r = await verifyHandoff(
      ctx,
      options({ count: 40, mode: "stratified", seed: 3 }),
    );
    const ra = r.setChecks.find((c) => c.id === "distribution-remoteness")!;
    const sp = r.setChecks.find((c) => c.id === "spatial-spread")!;
    if (ra.kind !== "distribution" || sp.kind !== "spatial") throw new Error();
    expect(ra.details!.holm).toBeNull();
    expect(sp.details!.holm!.tests).toBe(2);
  });
});

describe("verifying a CSV", () => {
  const set = generated({ count: 120, seed: 31 });
  const csv = toCsv(set);

  it("passes the site's own export, and reproduces it from the seed", async () => {
    const r = await verifyCsv(ctx, csv, { mode: "uniform", seed: 31 });
    expect(r.source).toBe("csv");
    expect(r.totalFailedRows).toBe(0);
    expect(statuses(r).reproducibility).toBe("pass");
    expect(overallPassed(r)).toBe(true);
  });

  it("accepts the same CSV with LF line endings (as a pasted textarea gives it)", async () => {
    const lf = csv.replace(/\r\n/g, "\n").trimEnd();
    expect(canonicalCsvText(lf)).toBe(csv);
    const r = await verifyCsv(ctx, lf, { mode: "uniform", seed: 31 });
    expect(statuses(r).reproducibility).toBe("pass");
  });

  it("fails reproducibility with the wrong seed or one edited byte", async () => {
    const wrongSeed = await verifyCsv(ctx, csv, { mode: "uniform", seed: 32 });
    expect(statuses(wrongSeed).reproducibility).toBe("fail");
    const edited = csv.replace("Main Street", "Main Streeu");
    const r = await verifyCsv(ctx, edited, { mode: "uniform", seed: 31 });
    expect(statuses(r).reproducibility).toBe("fail");
  });

  it("does not run reproducibility without a seed", async () => {
    const r = await verifyCsv(ctx, csv, { mode: "uniform", seed: null });
    expect(statuses(r).reproducibility).toBe("not-run");
    expect(statuses(r)["distribution-remoteness"]).toBe("pass");
  });

  it("lists deliberately broken rows under the checks they fail", async () => {
    const bad = set.map((a) => {
      if (a.id === 5) return { ...a, stamp: "REAL" as typeof MOCK_STAMP };
      if (a.id === 9) return { ...a, postcode: "3000" };
      if (a.id === 12) return { ...a, longitude: 144.9631, latitude: -37.8136 };
      if (a.id === 20) return { ...a, seifa_decile_sa: a.seifa_decile_sa === 1 ? 2 : 1 };
      return a;
    });
    const r = await verifyCsv(ctx, toCsv(bad), { mode: "uniform", seed: null });
    const failed = Object.fromEntries(r.recordChecks.map((c) => [c.id, c.failedIds]));
    expect(failed["mock-stamp"]).toEqual([5]);
    expect(failed["postcode-range"]).toEqual([9]);
    expect(failed["postcode-matches-suburb"]).toEqual([9]);
    expect(failed["address-format"]).toEqual([9]);
    expect(failed["point-in-suburb"]).toEqual([12]);
    expect(failed["point-in-sa"]).toEqual([12]);
    expect(failed["irsad-matches"]).toEqual([20]);
    expect(r.allFailedIds).toEqual([5, 9, 12, 20]);
    expect(r.totalFailedRows).toBe(4);
    expect(overallPassed(r)).toBe(false);
  });

  it("keeps malformed numbers as failures against their row", async () => {
    const lines = csv.split("\r\n");
    // row id 3: street_number "abc"
    const cells = lines[3].split(",");
    expect(cells[0]).toBe("3");
    lines[3] = lines[3].replace(/^3,([^,]*),("[^"]*"),([^,]*),(\d+),/, "3,$1,$2,$3,abc,");
    const r = await verifyCsv(ctx, lines.join("\r\n"), { mode: "uniform", seed: null });
    const req = r.recordChecks.find((c) => c.id === "required-fields")!;
    expect(req.failedIds).toEqual([3]);
    expect(req.failures[0].reason).toContain("street_number");
  });

  it("fails a deliberately skewed CSV on the distribution check", async () => {
    const majors = rows.filter((s) => s.addressable && s.ra === 0);
    const skewed = set.map((a, i) => asSuburb(a, majors[(i * 7) % majors.length]));
    const r = await verifyCsv(ctx, toCsv(skewed), { mode: "uniform", seed: null });
    expect(statuses(r)["distribution-remoteness"]).toBe("fail");
    expect(overallPassed(r)).toBe(false);
  });

  it("checks against the design you name", async () => {
    const strat = generated({
      count: 300,
      mode: "stratified",
      seed: 4,
      coordinates: false,
    });
    const r = await verifyCsv(ctx, toCsv(strat), { mode: "stratified", seed: 4 });
    expect(statuses(r)["distribution-remoteness"]).toBe("pass");
    expect(statuses(r).reproducibility).toBe("pass");
    expect(statuses(r)["spatial-spread"]).toBe("not-run");
    // as uniform, the quota mix is far from uniform's shares
    const asUniform = await verifyCsv(ctx, toCsv(strat), { mode: "uniform", seed: null });
    expect(statuses(asUniform)["distribution-remoteness"]).toBe("fail");
  });

  it("rejects a file that is not the site's CSV", async () => {
    await expect(
      verifyCsv(ctx, "a,b,c\n1,2,3", { mode: "uniform", seed: null }),
    ).rejects.toThrow("could not be read");
    await expect(
      verifyCsv(ctx, csv.split("\r\n")[0], { mode: "uniform", seed: null }),
    ).rejects.toThrow("no addresses");
  });
});

describe("CSV parser", () => {
  it("reads the site's export back exactly", () => {
    const set = generated({ count: 50, filters: { council: "Onkaparinga" } });
    const parsed = parseAddressesCSV(toCsv(set));
    expect(parsed.errors).toEqual([]);
    expect(parsed.addresses).toEqual(set);
  });

  it("reads quoted names with apostrophes and commas, and a byte order mark", () => {
    const set = generated({ count: 5, filters: { suburb: "O'HALLORAN HILL" } });
    const parsed = parseAddressesCSV(`﻿${toCsv(set)}`);
    expect(parsed.addresses).toEqual(set);
  });

  it("names the row with the wrong number of fields or a bad id", () => {
    const set = generated({ count: 3 });
    const lines = toCsv(set).split("\r\n");
    lines[2] = "x," + lines[2].split(",").slice(1).join(",");
    lines[3] = "1,2";
    const parsed = parseAddressesCSV(lines.join("\n"));
    expect(parsed.errors).toEqual([
      'Row 3: invalid id "x".',
      "Row 4: expected 14 fields, got 2.",
    ]);
  });
});

describe("verification report", () => {
  it("summarises every check, the seed and the timestamp", async () => {
    const r = await verifyHandoff(ctx, options({ count: 25 }));
    const md = generateMarkdownReport(r);
    expect(md).toContain(r.timestamp);
    expect(md).toContain("**Seed:** 2025");
    expect(md).toContain(settingsLine(r));
    expect(md).toContain("**All checks passed.**");
    for (const c of r.recordChecks) expect(md).toContain(`PASS: ${c.label}`);
    for (const c of r.setChecks) expect(md).toContain(`### PASS: ${c.label}`);
    expect(md).toContain("95% Wilson interval");
    expect(md).toContain("Known limitation:");
    expect(md).toContain("SHA-256");
    expect(md).toContain(MOCK_STAMP);
    const json = JSON.parse(generateJSONReport(r));
    expect(json.passed).toBe(true);
    expect(json.seed).toBe(2025);
    expect(json.setChecks).toHaveLength(4);
    expect(json.recordChecks).toHaveLength(16);
    expect(json.spotSample).toBeUndefined();
  });

  it("lists failing rows with their reasons", async () => {
    const set = generated({ count: 30 }).map((a) =>
      a.id === 2 ? { ...a, council: "Nowhere" } : a,
    );
    const r = await verifyCsv(ctx, toCsv(set), { mode: "uniform", seed: null });
    const md = generateMarkdownReport(r);
    expect(md).toContain("**Some checks failed.**");
    expect(md).toContain("FAIL: Council matches the reference");
    expect(md).toContain('- Row 2: council "Nowhere"');
    expect(md).toContain("### NOT RUN: Reproducible from the seed");
    expect(JSON.parse(generateJSONReport(r)).passed).toBe(false);
  });
});
