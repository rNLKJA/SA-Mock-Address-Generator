import { describe, expect, it } from "vitest";
import { PythonRandom } from "@/lib/rng/python-random";
import { suburbsJson } from "@/lib/test-utils/data";
import {
  generateMockAddresses,
  shuffledSchedule,
  type GenerateOptions,
} from "./generate";
import {
  EQUAL_REMOTENESS_WEIGHTS,
  allocateQuotas,
  configRemotenessWeights,
  defaultWeights,
  minCountForEveryStratum,
} from "./weights";

const rows = suburbsJson.rows;
const base: GenerateOptions = {
  count: 1000,
  seed: 2026,
  mode: "stratified",
  filters: {},
  weights: defaultWeights(),
  coordinates: false,
};

describe("allocateQuotas (largest remainder)", () => {
  it("allocates exactly when shares are whole", () => {
    expect(allocateQuotas(1000, configRemotenessWeights())).toEqual([
      400, 250, 200, 100, 50,
    ]);
  });

  it("hands leftovers to the largest remainders, ties to the earlier stratum", () => {
    expect(allocateQuotas(7, [1, 1, 1])).toEqual([3, 2, 2]);
    expect(allocateQuotas(10, [0.4, 0.25, 0.2, 0.1, 0.05])).toEqual([4, 3, 2, 1, 0]);
    // 1.5, 0.9, 0.6: floors 1, 0, 0, then the two largest remainders (0.9, 0.6)
    expect(allocateQuotas(3, [0.5, 0.3, 0.2])).toEqual([1, 1, 1]);
  });

  it("always sums to the count and gives zero weights nothing", () => {
    for (const n of [0, 1, 2, 17, 999, 5000]) {
      const q = allocateQuotas(n, [0.4, 0, 0.35, 0.25]);
      expect(q.reduce((a, b) => a + b, 0)).toBe(n);
      expect(q[1]).toBe(0);
    }
    expect(allocateQuotas(10, [0, 0])).toEqual([0, 0]);
  });
});

describe("minCountForEveryStratum", () => {
  /** Brute force: the smallest n such that every count from n to `upTo` reaches all. */
  function bruteForce(weights: number[], upTo: number): number {
    const reaches = (n: number) =>
      allocateQuotas(n, weights).every((q, i) => !(weights[i] > 0) || q > 0);
    let n = upTo;
    while (n > 1 && reaches(n - 1)) n--;
    return n;
  }

  it("matches a brute-force search", () => {
    const cases = [
      configRemotenessWeights(),
      [...EQUAL_REMOTENESS_WEIGHTS],
      [0.4, 0, 0.2, 0.1, 0.05],
      [1, 1 / 3, 0.01],
      [0.7, 0.2, 0.1],
      [5, 1],
    ];
    for (const w of cases) {
      const min = minCountForEveryStratum(w);
      expect(min).toBe(bruteForce(w, 2000));
      // and every live stratum really gets one from there on
      for (let n = min; n < min + 300; n++)
        expect(allocateQuotas(n, w).every((q, i) => !(w[i] > 0) || q > 0)).toBe(true);
    }
  });

  it("gives the config.py weights' answer and handles edge cases", () => {
    // Very Remote has 5%: at 19 addresses its exact share is 0.95 and loses the
    // largest-remainder race, so it needs more than the naive 1 / 0.05 = 20
    const min = minCountForEveryStratum(configRemotenessWeights());
    expect(allocateQuotas(min - 1, configRemotenessWeights())[4]).toBe(0);
    expect(minCountForEveryStratum([...EQUAL_REMOTENESS_WEIGHTS])).toBe(5);
    expect(minCountForEveryStratum([0, 0])).toBe(0);
    expect(minCountForEveryStratum([3])).toBe(1);
  });
});

describe("shuffledSchedule", () => {
  it("is Python's random.shuffle on the quota list", () => {
    // CPython: random.seed(1); x = [0]*3 + [1]*2 + [2]; random.shuffle(x) -> [0, 1, 2, 0, 1, 0]
    const s = shuffledSchedule([3, 2, 1], new PythonRandom(1));
    expect(Array.from(s).sort()).toEqual([0, 0, 0, 1, 1, 2]);
    expect(Array.from(s)).toEqual([0, 1, 2, 0, 1, 0]);
  });
});

describe("stratified generation", () => {
  it("hits the quotas exactly, for any seed", () => {
    for (const seed of [1, 2, 3, 2025]) {
      const r = generateMockAddresses(rows, null, { ...base, seed });
      expect(r.error).toBeNull();
      expect(r.quotas).toEqual([400, 250, 200, 100, 50]);
      expect(r.observed.remoteness).toEqual([400, 250, 200, 100, 50]);
      r.expected.remoteness.forEach((e, h) =>
        expect(e).toBeCloseTo(r.quotas![h] / 1000, 12),
      );
    }
  });

  it("supports equal allocation and keeps addresses inside their area", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      count: 503,
      weights: { ...defaultWeights(), remoteness: [...EQUAL_REMOTENESS_WEIGHTS] },
    });
    expect(r.quotas).toEqual([101, 101, 101, 100, 100]);
    const byCode = new Map(rows.map((s) => [s.code, s]));
    const counts = [0, 0, 0, 0, 0];
    for (const a of r.addresses) counts[byCode.get(a.sal_code)!.ra]++;
    expect(counts).toEqual(r.quotas);
  });

  it("renormalises over the areas left by a filter", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      count: 90,
      filters: { council: "Unincorporated SA" },
    });
    expect(r.error).toBeNull();
    const sum = r.quotas!.reduce((a, b) => a + b, 0);
    expect(sum).toBe(90);
    // the unincorporated area has no Inner Regional locality, so the other
    // weights (0.4, 0.2, 0.1, 0.05) are renormalised over 0.75
    expect(r.quotas).toEqual([48, 0, 24, 12, 6]);
  });

  it("is deterministic and differs from the random remoteness design", () => {
    const a = generateMockAddresses(rows, null, base).addresses;
    const b = generateMockAddresses(rows, null, base).addresses;
    expect(a).toEqual(b);
    const weighted = generateMockAddresses(rows, null, { ...base, mode: "remoteness" });
    expect(weighted.quotas).toBeNull();
    expect(weighted.observed.remoteness).not.toEqual([400, 250, 200, 100, 50]);
  });

  it("flags live areas whose quota rounds to zero", () => {
    const small = generateMockAddresses(rows, null, { ...base, count: 10 });
    expect(small.quotas).toEqual([4, 3, 2, 1, 0]);
    expect(small.emptyQuotas).toEqual({
      areas: [4],
      minCount: minCountForEveryStratum(configRemotenessWeights()),
    });
    expect(generateMockAddresses(rows, null, base).emptyQuotas).toBeNull();
    // a zero weight is a choice, not a rounding casualty
    const noVeryRemote = generateMockAddresses(rows, null, {
      ...base,
      count: 10,
      weights: { ...defaultWeights(), remoteness: [0.4, 0.25, 0.2, 0.1, 0] },
    });
    expect(noVeryRemote.emptyQuotas).toBeNull();
    // other designs never report it
    expect(
      generateMockAddresses(rows, null, { ...base, count: 10, mode: "remoteness" })
        .emptyQuotas,
    ).toBeNull();
  });

  it("reports zero weights instead of silently falling back", () => {
    const r = generateMockAddresses(rows, null, {
      ...base,
      weights: { ...defaultWeights(), remoteness: [0, 0, 0, 0, 0] },
    });
    expect(r.error).toMatch(/zero/);
    expect(r.addresses).toHaveLength(0);
  });
});
