import { describe, expect, it } from "vitest";
import fixture from "@/lib/__fixtures__/original-parity.json";
import { NumpyLegacyRandomState } from "./numpy-legacy";
import { PythonRandom } from "./python-random";

describe("PythonRandom matches CPython's random module", () => {
  for (const ref of fixture.rng.python) {
    it(`seed ${ref.seed}`, () => {
      let r = new PythonRandom(BigInt(ref.seed));
      expect(ref.getrandbits32.map(() => r.getrandbits(32))).toEqual(ref.getrandbits32);
      r = new PythonRandom(BigInt(ref.seed));
      expect(ref.randint1to999.map(() => r.randint(1, 999))).toEqual(ref.randint1to999);
      r = new PythonRandom(BigInt(ref.seed));
      expect(ref.randbelow49.map(() => r.randrange(0, 49))).toEqual(ref.randbelow49);
      r = new PythonRandom(BigInt(ref.seed));
      expect(ref.random.map(() => r.random())).toEqual(ref.random);
    });
  }

  it("rejects empty choices like Python", () => {
    expect(() => new PythonRandom(1).choice([])).toThrow();
  });
});

describe("NumpyLegacyRandomState matches numpy.random.RandomState", () => {
  for (const ref of fixture.rng.numpy) {
    it(`seed ${ref.seed}`, () => {
      let rs = new NumpyLegacyRandomState(ref.seed);
      expect(ref.uint32.map(() => rs.nextUint32())).toEqual(ref.uint32);
      rs = new NumpyLegacyRandomState(ref.seed);
      expect(Array.from(rs.permutation(10))).toEqual(ref.permutation10);
      rs = new NumpyLegacyRandomState(ref.seed);
      expect(ref.choice1894.map(() => rs.choiceWithoutReplacement(1894, 1)[0])).toEqual(
        ref.choice1894,
      );
    });
  }

  it("validates the legacy seed range", () => {
    expect(() => new NumpyLegacyRandomState(-1)).toThrow();
    expect(() => new NumpyLegacyRandomState(2 ** 32)).toThrow();
  });
});
