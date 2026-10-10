import { describe, expect, it } from "vitest";
import type { MockAddress } from "@/lib/generator/generate";
import { MOCK_STAMP, RA_NAMES } from "@/lib/suburbs";
import {
  asSuburb,
  broken,
  byCode,
  byName,
  generated,
  index,
} from "@/lib/test-utils/verification";
import {
  checkAddressFormat,
  checkCouncilMatches,
  checkDuplicateAddresses,
  checkDuplicateCoordinates,
  checkIrsadMatches,
  checkMockStamp,
  checkPointInSouthAustralia,
  checkPointInSuburb,
  checkPostcodeMatchesSuburb,
  checkPostcodeRange,
  checkRemotenessMatches,
  checkRequiredFields,
  checkStateIsSA,
  checkStreetName,
  checkStreetNumber,
  checkSuburbInReference,
  isSaPostcode,
  runRecordChecks,
} from "./checks";
import type { RecordCheck } from "./types";

/** 200 addresses from the site's generator (seed 2025, uniform, coordinates on). */
const good = generated();
const first = good[0];
const ADELAIDE = byName.get("ADELAIDE")!;
const GLENELG = byName.get("GLENELG")!;
const GLENELG_NORTH = byName.get("GLENELG NORTH")!;
const AMATA = byName.get("AMATA")!;
const COOBER_PEDY = byName.get("COOBER PEDY")!;

function expectOnlyFailure(check: RecordCheck, id: number, reason: RegExp | string) {
  expect(check.failed, check.id).toBe(1);
  expect(check.failedIds).toEqual([id]);
  expect(check.failures[0].id).toBe(id);
  if (typeof reason === "string") expect(check.failures[0].reason).toContain(reason);
  else expect(check.failures[0].reason).toMatch(reason);
}

describe("record checks on a set from the site's own generator", () => {
  it("pass every check on every row", () => {
    const checks = runRecordChecks(good, byCode, index);
    expect(checks).toHaveLength(16);
    expect(new Set(checks.map((c) => c.id)).size).toBe(16);
    for (const c of checks) {
      expect(c.failed, `${c.id}: ${c.failures[0]?.reason}`).toBe(0);
      expect(c.passed + c.skipped, c.id).toBe(good.length);
      expect(c.description.length, c.id).toBeGreaterThan(10);
    }
  });

  it("pass with coordinates off, the point checks then not applying", () => {
    const noCoords = generated({ coordinates: false, count: 100 });
    const checks = runRecordChecks(noCoords, byCode, index);
    for (const c of checks) expect(c.failed, c.id).toBe(0);
    const pip = checks.find((c) => c.id === "point-in-suburb")!;
    expect(pip.skipped).toBe(100);
    expect(checks.find((c) => c.id === "no-duplicate-coordinates")!.skipped).toBe(100);
  });

  it("pass for every design, including the APY Lands' 0872 postcode", () => {
    for (const mode of ["remoteness", "seifa", "population", "stratified"] as const) {
      const set = generated({ mode, count: 150, seed: 11 });
      for (const c of runRecordChecks(set, byCode, index))
        expect(c.failed, `${mode} ${c.id}`).toBe(0);
    }
    const remote = generated({ count: 40, filters: { suburb: "AMATA" } });
    expect(remote.every((a) => a.postcode === "0872")).toBe(true);
    for (const c of runRecordChecks(remote, byCode, index))
      expect(c.failed, `AMATA ${c.id}`).toBe(0);
  });
});

describe("required fields", () => {
  it("fails a row with an empty field, a NaN number or half a coordinate", () => {
    expectOnlyFailure(
      checkRequiredFields(broken(good, 3, { council: "" })),
      3,
      "council is empty",
    );
    expectOnlyFailure(
      checkRequiredFields(broken(good, 4, { street_number: Number.NaN })),
      4,
      "street_number",
    );
    expectOnlyFailure(
      checkRequiredFields(broken(good, 5, { longitude: null })),
      5,
      "only one of latitude and longitude",
    );
    expectOnlyFailure(
      checkRequiredFields(
        broken(good, 6, { latitude: Number.NaN, longitude: Number.NaN }),
      ),
      6,
      "not a number",
    );
    expectOnlyFailure(
      checkRequiredFields(broken(good, 7, { seifa_decile_sa: 4.5 })),
      7,
      "seifa_decile_sa",
    );
  });

  it("lists every problem on a row", () => {
    const c = checkRequiredFields(broken(good, 2, { suburb: "", sal_code: "" }));
    expect(c.failures[0].reason).toBe("suburb is empty, sal_code is empty");
  });
});

describe("format", () => {
  it("fails a missing or wrong MOCK marker", () => {
    expectOnlyFailure(
      checkMockStamp(broken(good, 9, { stamp: "" as typeof MOCK_STAMP })),
      9,
      "stamp",
    );
    expectOnlyFailure(
      checkMockStamp(broken(good, 10, { stamp: "REAL" as typeof MOCK_STAMP })),
      10,
      '"REAL"',
    );
  });

  it("fails an address that does not match its parts", () => {
    expectOnlyFailure(
      checkAddressFormat(broken(good, 11, { full_address: first.full_address })),
      11,
      "full_address",
    );
    expectOnlyFailure(
      checkAddressFormat(broken(good, 12, { street_address: "1 Nowhere Lane" })),
      12,
      "street_address",
    );
  });

  it("fails street numbers outside 1 to 999 and streets not on the 2025 list", () => {
    expectOnlyFailure(checkStreetNumber(broken(good, 13, { street_number: 0 })), 13, "0");
    expectOnlyFailure(
      checkStreetNumber(broken(good, 14, { street_number: 1000 })),
      14,
      "1000",
    );
    expectOnlyFailure(
      checkStreetName(broken(good, 15, { street_name: "Rundle Mall" })),
      15,
      "Rundle Mall",
    );
  });

  it("fails an address in another state", () => {
    const vic = broken(good, 16, { full_address: "1 Main Street, MELBOURNE VIC 3000" });
    expectOnlyFailure(checkStateIsSA(vic), 16, "MELBOURNE VIC");
  });

  it("knows SA's postcodes, including 0872", () => {
    expect(isSaPostcode("5000")).toBe(true);
    expect(isSaPostcode("5999")).toBe(true);
    expect(isSaPostcode("0872")).toBe(true);
    for (const bad of ["4999", "6000", "3000", "0870", "500", "50000", "50a0", ""])
      expect(isSaPostcode(bad), bad).toBe(false);
    expectOnlyFailure(
      checkPostcodeRange(broken(good, 17, { postcode: "3000" })),
      17,
      "3000",
    );
  });
});

describe("reference data", () => {
  it("fails an unknown SAL code or a code that names another suburb", () => {
    const unknown = broken(good, 20, { sal_code: "49999" });
    expectOnlyFailure(
      checkSuburbInReference(unknown, byCode),
      20,
      "not in the reference",
    );
    const swapped = broken(good, 21, { sal_code: ADELAIDE.code });
    if (good[20].suburb !== "ADELAIDE")
      expectOnlyFailure(checkSuburbInReference(swapped, byCode), 21, "is ADELAIDE");
  });

  it("skips the reference comparisons for a row whose suburb is unknown", () => {
    const unknown = broken(good, 20, { sal_code: "49999", remoteness_level: "Nowhere" });
    for (const check of [
      checkPostcodeMatchesSuburb,
      checkCouncilMatches,
      checkRemotenessMatches,
      checkIrsadMatches,
    ]) {
      const c = check(unknown, byCode);
      expect(c.failed, c.id).toBe(0);
      expect(c.skipped, c.id).toBe(1);
    }
  });

  it("fails a postcode the suburb does not have", () => {
    const row = asSuburb(first, ADELAIDE);
    const set = [{ ...row, postcode: "5045" }];
    const c = checkPostcodeMatchesSuburb(set, byCode);
    expectOnlyFailure(c, first.id, "5045 is not a postcode of ADELAIDE (5000)");
  });

  it("fails a council that is not the suburb's", () => {
    const set = [{ ...asSuburb(first, GLENELG), council: "Adelaide" }];
    expectOnlyFailure(
      checkCouncilMatches(set, byCode),
      first.id,
      'reference "Holdfast Bay"',
    );
  });

  it("fails a remoteness class that is valid but not the suburb's", () => {
    // Coober Pedy is Very Remote: "Remote Australia" is a valid class, but wrong here.
    const row = asSuburb(first, COOBER_PEDY);
    expect(row.remoteness_level).toBe("Very Remote Australia");
    const set = [{ ...row, remoteness_level: RA_NAMES[3] }];
    expectOnlyFailure(
      checkRemotenessMatches(set, byCode),
      first.id,
      '"Remote Australia", reference "Very Remote Australia"',
    );
  });

  it("fails an IRSAD decile that is in range but not the suburb's", () => {
    const row = asSuburb(first, GLENELG);
    expect(row.seifa_decile_sa).toBe(8);
    expectOnlyFailure(
      checkIrsadMatches([{ ...row, seifa_decile_sa: 7 }], byCode),
      first.id,
      "decile 7, reference 8",
    );
    expectOnlyFailure(
      checkIrsadMatches([{ ...row, seifa_decile_sa: null }], byCode),
      first.id,
      "decile empty, reference 8",
    );
    const noSeifa = asSuburb(first, byName.get("ADELAIDE AIRPORT")!);
    expect(noSeifa.seifa_decile_sa).toBeNull();
    expect(checkIrsadMatches([noSeifa], byCode).passed).toBe(1);
    expect(checkIrsadMatches([{ ...noSeifa, seifa_decile_sa: 5 }], byCode).failed).toBe(
      1,
    );
  });

  it("passes the APY Lands with their 0872 postcode", () => {
    const row = asSuburb(first, AMATA);
    expect(checkPostcodeRange([row]).passed).toBe(1);
    expect(checkPostcodeMatchesSuburb([row], byCode).passed).toBe(1);
  });
});

describe("point in polygon", () => {
  const atGlenelg = asSuburb(first, GLENELG);

  it("passes a point inside its own suburb", () => {
    expect(checkPointInSuburb([atGlenelg], index, byCode).passed).toBe(1);
    expect(checkPointInSouthAustralia([atGlenelg], index).passed).toBe(1);
  });

  it("fails a point that sits in the neighbouring suburb, and names it", () => {
    const moved: MockAddress = {
      ...atGlenelg,
      longitude: GLENELG_NORTH.label[0],
      latitude: GLENELG_NORTH.label[1],
    };
    expect(index.locate([moved.longitude!, moved.latitude!])).toBe(GLENELG_NORTH.code);
    const c = checkPointInSuburb([moved], index, byCode);
    expectOnlyFailure(c, first.id, "is outside GLENELG and falls in GLENELG NORTH");
    // still in South Australia
    expect(checkPointInSouthAustralia([moved], index).passed).toBe(1);
  });

  it("fails a point in another state or out at sea", () => {
    const melbourne: MockAddress = {
      ...atGlenelg,
      longitude: 144.9631,
      latitude: -37.8136,
    };
    expectOnlyFailure(
      checkPointInSuburb([melbourne], index, byCode),
      first.id,
      "falls in no SA suburb",
    );
    expectOnlyFailure(
      checkPointInSouthAustralia([melbourne], index),
      first.id,
      "is in no South Australian suburb",
    );
    const gulf: MockAddress = { ...atGlenelg, longitude: 138.2, latitude: -35.0 };
    expect(index.locate([138.2, -35.0])).toBeNull();
    expect(checkPointInSouthAustralia([gulf], index).failed).toBe(1);
  });

  it("fails a point whose SAL code has no boundary", () => {
    const c = checkPointInSuburb([{ ...atGlenelg, sal_code: "49999" }], index, byCode);
    expectOnlyFailure(c, first.id, 'no boundary for SAL code "49999"');
  });

  it("does not apply to rows without coordinates", () => {
    const none: MockAddress = { ...atGlenelg, latitude: null, longitude: null };
    expect(checkPointInSuburb([none], index, byCode).skipped).toBe(1);
    expect(checkPointInSouthAustralia([none], index).skipped).toBe(1);
  });

  it("lists every failing row of a broken set, in id order", () => {
    const set = good.map((a) =>
      a.id % 50 === 0 ? { ...a, longitude: 144.9631, latitude: -37.8136 } : a,
    );
    const c = checkPointInSuburb(set, index, byCode);
    expect(c.failedIds).toEqual([50, 100, 150, 200]);
    expect(c.passed).toBe(196);
  });
});

describe("duplicates", () => {
  it("fails both rows of a repeated address", () => {
    const set = broken(good, 30, {
      full_address: good[0].full_address,
    });
    const c = checkDuplicateAddresses(set);
    expect(c.failedIds).toEqual([1, 30]);
    expect(c.failures[0].reason).toBe("shared with row 30");
    expect(c.failures[1].reason).toBe("shared with row 1");
  });

  it("fails repeated coordinates and ignores rows without any", () => {
    const set = broken(good, 31, {
      latitude: good[1].latitude,
      longitude: good[1].longitude,
    });
    expect(checkDuplicateCoordinates(set).failedIds).toEqual([2, 31]);
    const none = good.map((a) => ({ ...a, latitude: null, longitude: null }));
    const c = checkDuplicateCoordinates(none);
    expect(c.failed).toBe(0);
    expect(c.skipped).toBe(good.length);
  });
});
