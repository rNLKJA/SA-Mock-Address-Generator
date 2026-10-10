import { describe, expect, it } from "vitest";
import { generateMockAddresses } from "@/lib/generator/generate";
import { toCsv } from "@/lib/generator/format";
import { defaultWeights } from "@/lib/generator/weights";
import { index, options, rows } from "@/lib/test-utils/verification";
import { parseVerifyParams, verifyHref, verifySearch } from "./params";

const parse = (search: string) => parseVerifyParams(new URLSearchParams(search));

describe("the /generate to /verify hand-off", () => {
  it("writes only what differs from the defaults", () => {
    expect(verifySearch(options({ count: 25 }))).toBe("seed=2025&count=25&mode=uniform");
    expect(verifyHref(options({ count: 25 }))).toBe(
      "/verify?seed=2025&count=25&mode=uniform",
    );
  });

  it("round-trips every setting that changes the output", () => {
    const cases = [
      options({ count: 25 }),
      options({ mode: "remoteness", seed: 0 }),
      options({ mode: "seifa", seed: 4294967295, coordinates: false }),
      options({ mode: "population", filters: { council: "Holdfast Bay" } }),
      options({
        mode: "stratified",
        count: 40,
        weights: { ...defaultWeights(), remoteness: [1, 1, 1, 1, 1] },
      }),
      options({
        mode: "seifa",
        weights: { ...defaultWeights(), decile: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0.25] },
      }),
      options({ filters: { suburb: "O'HALLORAN HILL" } }),
      options({ filters: { ra: 4, decile: 1 } }),
      options({ filters: { ra: 0 } }),
    ];
    for (const o of cases) {
      const parsed = parse(verifySearch(o));
      expect(parsed.kind, verifySearch(o)).toBe("ok");
      if (parsed.kind !== "ok") continue;
      expect(parsed.options).toEqual(o);
    }
  });

  it("regenerates the identical set from the link", () => {
    for (const o of [
      options({ count: 300, mode: "remoteness", seed: 77 }),
      options({
        count: 50,
        mode: "stratified",
        weights: { ...defaultWeights(), remoteness: [3, 1, 1, 1, 1] },
      }),
      options({ count: 30, filters: { council: "Coober Pedy" }, coordinates: false }),
    ]) {
      const parsed = parse(verifySearch(o));
      if (parsed.kind !== "ok") throw new Error(parsed.kind);
      const a = generateMockAddresses(rows, index, o);
      const b = generateMockAddresses(rows, index, parsed.options);
      expect(toCsv(b.addresses)).toBe(toCsv(a.addresses));
    }
  });

  it("is no hand-off without a seed", () => {
    expect(parse("")).toEqual({ kind: "none" });
    expect(parse("count=25&mode=uniform")).toEqual({ kind: "none" });
  });

  it("defaults the design to uniform and coordinates to on", () => {
    const p = parse("seed=1&count=5");
    expect(p).toEqual({ kind: "ok", options: options({ seed: 1, count: 5 }) });
  });

  it("explains a broken link instead of guessing", () => {
    const bad = [
      ["seed=-1&count=5", "seed"],
      ["seed=1.5&count=5", "seed"],
      ["seed=4294967296&count=5", "seed"],
      ["seed=x&count=5", "seed"],
      ["seed=1", "count"],
      ["seed=1&count=0", "count"],
      ["seed=1&count=5001", "count"],
      ["seed=1&count=5&mode=random", "design"],
      ["seed=1&count=5&ra=5", "remoteness"],
      ["seed=1&count=5&decile=0", "decile"],
      ["seed=1&count=5&rw=1,2,3", "Remoteness weights"],
      ["seed=1&count=5&rw=1,2,3,4,-5", "Remoteness weights"],
      ["seed=1&count=5&dw=1,1,1,1,1,1,1,1,1,x", "Decile weights"],
    ] as const;
    for (const [search, word] of bad) {
      const p = parse(search);
      expect(p.kind, search).toBe("error");
      if (p.kind === "error") expect(p.error, search).toContain(word);
    }
  });
});
