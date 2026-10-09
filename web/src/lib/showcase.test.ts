/**
 * The guided tour quotes numbers in its captions; this recomputes each one
 * with the same code, seed and settings, checks the mocked AI reply against
 * the real contract, and checks that the committed media and the README match
 * the step lists in src/lib/showcase.ts.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mockProposal } from "../../e2e/mock-ai";
import {
  ProposalSchema,
  buildUserMessage,
  reviewProposal,
  type GeneratorSettings,
  type ScenarioCatalogue,
} from "@/lib/ai/scenario-config";
import { ADELAIDE_GPO, GeometryIndex, haversineKm, type LonLat } from "@/lib/geo";
import { generateMockAddresses } from "@/lib/generator/generate";
import { configRemotenessWeights, defaultWeights } from "@/lib/generator/weights";
import { cohensWLabel, goodnessOfFit, wilson } from "@/lib/stats";
import { RA_NAMES } from "@/lib/suburbs";
import { salGeojson, suburbsJson } from "@/lib/test-utils/data";
import { formatInt, formatP, formatPct, formatPctFixed } from "@/lib/utils";
import {
  MOCK_ANSWER_PREFIX,
  MOCK_PROPOSAL,
  MOCK_SCENARIO,
  SCREENSHOTS,
  TOUR_CSV,
  TOUR_FIRST_ADDRESS,
  TOUR_SAMPLE,
  WALKTHROUGHS,
  screenshotSrc,
  walkthroughMedia,
  type WalkthroughId,
} from "./showcase";

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const ROOT = path.resolve(WEB, "..");
const PUBLIC = path.join(WEB, "public");
const DOCS_SHOWCASE = path.join(ROOT, "docs", "showcase");
const README = readFileSync(path.join(ROOT, "README.md"), "utf8");

const KB = 1024;
const MB = 1024 * KB;
const publicFile = (src: string) => path.join(PUBLIC, src);
const steps = (id: WalkthroughId) => WALKTHROUGHS.find((w) => w.id === id)!.steps;

describe("showcase definitions", () => {
  it("number the screenshots 01, 02, ... with unique kebab-case names", () => {
    SCREENSHOTS.forEach((s, i) => {
      expect(s.id).toMatch(/^\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.id.slice(0, 2)).toBe(String(i + 1).padStart(2, "0"));
    });
    expect(new Set(SCREENSHOTS.map((s) => s.id)).size).toBe(SCREENSHOTS.length);
    expect(SCREENSHOTS[0].id).toBe("01-landing-light");
    expect(SCREENSHOTS[1].id).toBe("02-landing-dark");
    const mobile = SCREENSHOTS.filter((s) => s.viewport === "mobile").length;
    expect(mobile).toBeGreaterThanOrEqual(2);
    expect(mobile).toBeLessThanOrEqual(3);
  });

  it("give each walkthrough distinct steps", () => {
    expect(WALKTHROUGHS.map((w) => w.id)).toEqual([
      "generate-a-test-set",
      "did-the-sample-hit-the-target",
      "look-up-a-real-address",
    ]);
    for (const w of WALKTHROUGHS) {
      expect(w.steps.length).toBeGreaterThan(3);
      expect(new Set(w.steps).size).toBe(w.steps.length);
      for (const k of w.mockedSteps ?? []) {
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThanOrEqual(w.steps.length);
      }
    }
  });
});

describe("the numbers the walkthroughs quote", () => {
  const index = new GeometryIndex(salGeojson);
  const run = (mode: "remoteness" | "uniform") =>
    generateMockAddresses(suburbsJson.rows, index, {
      ...TOUR_SAMPLE,
      mode,
      weights: defaultWeights(),
    });
  const weighted = run("remoteness");
  const uniform = run("uniform");
  /** The target check's verdict text for these counts and target shares. */
  const verdict = (observed: number[], target: number[]) => {
    const total = target.reduce((a, b) => a + b, 0);
    const fit = goodnessOfFit(
      observed,
      target.map((t) => t / total),
      { seed: 2025 },
    )!;
    expect(fit.method).toBe("chi-square");
    return `χ²(${fit.df}) = ${fit.statistic.toFixed(2)}, ${formatP(fit.pValue)}, Cohen's w = ${fit.w.toFixed(3)} (${cohensWLabel(fit.w)})`;
  };

  it("seed 2025 gives the same first address, 200 rows and the CSV name", () => {
    expect(weighted.addresses).toHaveLength(200);
    expect(weighted.addresses[0].full_address).toBe(TOUR_FIRST_ADDRESS);
    expect(weighted.coordinateFallbacks).toBe(0);
    expect(TOUR_CSV).toBe(
      `sa-mock-addresses_seed-${TOUR_SAMPLE.seed}_${TOUR_SAMPLE.count}.csv`,
    );
  });

  it("Major Cities: 84 of 200 with its Wilson interval, against 40%", () => {
    const k = weighted.observed.remoteness[0];
    const [lo, hi] = wilson(k, 200);
    const target = configRemotenessWeights()[0];
    expect(steps("did-the-sample-hit-the-target")[2]).toBe(
      `Major Cities: ${k} of 200 (${formatPct(k / 200)}, 95% CI ${formatPct(lo)} to ${formatPct(hi)}) against a ${formatPct(target)} target`,
    );
  });

  it("the weighted sample is on target and the uniform one is not", () => {
    const step = steps("did-the-sample-hit-the-target");
    const own = verdict(weighted.observed.remoteness, weighted.expected.remoteness);
    expect(own).toBe("χ²(4) = 2.77, p = 0.60, Cohen's w = 0.118 (small)");
    expect(step[3]).toBe(`Pearson chi-square: ${own}: on target`);
    const promised = verdict(uniform.observed.remoteness, configRemotenessWeights());
    expect(promised).toBe("χ²(4) = 74.68, p < 0.001, Cohen's w = 0.611 (large)");
    expect(step[5]).toBe(
      `Against the README's promised weights: ${promised.replace("Cohen's w", "w")}: off target`,
    );
  });

  it("the 200-seed rejection count carries its own Wilson interval", () => {
    // the count (6 of 200) is recomputed in src/lib/sampling/claims.test.ts
    const [lo, hi] = wilson(6, 200);
    expect(steps("did-the-sample-hit-the-target")[7]).toContain(
      `in 6 (${formatPctFixed(6 / 200)}, 95% CI ${formatPctFixed(lo)} to ${formatPctFixed(hi)})`,
    );
  });

  it("Glenelg and Coober Pedy are what the lookup says they are", () => {
    const byName = (name: string) => suburbsJson.rows.find((r) => r.name === name)!;
    // Photon's coordinates for the Glenelg Jetty footway and the Coober Pedy town node
    const jetty: LonLat = [138.5092949, -34.9804861];
    const town: LonLat = [134.7536164, -29.0133682];
    expect(index.locate(jetty)).toBeNull();
    expect(index.nearest(jetty, 2)?.code).toBe(byName("GLENELG").code);
    expect(index.locate(town)).toBe(byName("COOBER PEDY").code);

    const glenelg = byName("GLENELG");
    const lookup = steps("look-up-a-real-address");
    expect(lookup[3]).toBe(
      `Glenelg: postcode ${glenelg.postcode}, ${glenelg.council} council, Major Cities, IRSAD decile ${glenelg.decileSa} in SA`,
    );
    expect(glenelg.ra).toBe(0);
    const coober = byName("COOBER PEDY");
    expect(lookup[5]).toBe(
      `Coober Pedy, ${formatInt(Math.round(haversineKm(ADELAIDE_GPO, town)))} km from the Adelaide GPO: ${RA_NAMES[coober.ra]}, IRSAD decile ${coober.decileSa} in SA`,
    );
  });
});

describe("the mocked AI reply used in the screenshots", () => {
  const rows = suburbsJson.rows.filter((r) => r.addressable);
  const councils = new Map<string, number>();
  for (const r of rows) councils.set(r.council, (councils.get(r.council) ?? 0) + 1);
  const catalogue: ScenarioCatalogue = {
    councils: [...councils].map(([name, count]) => ({ name, count })),
    suburbs: rows.map((r) => r.name),
    raCounts: [0, 1, 2, 3, 4].map((h) => rows.filter((r) => r.ra === h).length),
    decileCounts: Array.from(
      { length: 10 },
      (_, d) => rows.filter((r) => r.decileSa === d + 1).length,
    ),
    noDecile: rows.filter((r) => r.decileSa === null).length,
    total: rows.length,
  };
  const current: GeneratorSettings = {
    count: 25,
    seed: 2025,
    mode: "uniform",
    weights: defaultWeights(),
    filters: {},
    coordinates: true,
    format: "text",
  };

  it("matches the structured-output contract and says it is a mock", () => {
    const proposal = ProposalSchema.parse(
      mockProposal(buildUserMessage(MOCK_SCENARIO, current)),
    );
    expect(proposal).toEqual(MOCK_PROPOSAL);
    expect(proposal.rationale.startsWith(MOCK_ANSWER_PREFIX)).toBe(true);
    const other = ProposalSchema.parse(
      mockProposal(buildUserMessage("anything else", current)),
    );
    expect(other.rationale.startsWith(MOCK_ANSWER_PREFIX)).toBe(true);
  });

  it("passes every reference-table check and gives 8 addresses per area", () => {
    const review = reviewProposal(MOCK_PROPOSAL, current, catalogue);
    expect(review.checks.invalid_fields).toEqual([]);
    expect(review.fields.filter((f) => f.recommended).map((f) => f.key)).toEqual([
      "count",
      "mode",
      "remoteness_weights",
      "output_format",
    ]);
    const res = generateMockAddresses(suburbsJson.rows, null, {
      count: MOCK_PROPOSAL.count,
      seed: current.seed,
      mode: MOCK_PROPOSAL.mode,
      filters: {},
      weights: { ...defaultWeights(), remoteness: MOCK_PROPOSAL.remoteness_weights! },
      coordinates: false,
    });
    expect(res.observed.remoteness).toEqual([8, 8, 8, 8, 8]);
  });
});

describe("showcase media (pnpm showcase)", () => {
  it("has a PNG under 600 KB and a WebP copy for every screenshot", () => {
    for (const s of SCREENSHOTS) {
      const png = path.join(DOCS_SHOWCASE, `${s.id}.png`);
      expect(existsSync(png), png).toBe(true);
      expect(statSync(png).size, png).toBeLessThan(600 * KB);
      expect(existsSync(publicFile(screenshotSrc(s.id))), s.id).toBe(true);
    }
  });

  it("has an MP4 and a GIF of at most 8 MB, a poster and captions for every walkthrough", () => {
    for (const w of WALKTHROUGHS) {
      const media = walkthroughMedia(w.id);
      const mp4 = publicFile(media.mp4);
      const gif = path.join(DOCS_SHOWCASE, `${w.id}.gif`);
      for (const file of [mp4, gif]) {
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeLessThanOrEqual(8 * MB);
      }
      expect(existsSync(publicFile(media.poster)), media.poster).toBe(true);
    }
  });

  it("captions every step of each video, in order, with the on-screen text", () => {
    for (const w of WALKTHROUGHS) {
      const vtt = readFileSync(publicFile(walkthroughMedia(w.id).captions), "utf8");
      expect(vtt.startsWith("WEBVTT")).toBe(true);
      const cues = [...vtt.matchAll(/^Step (\d+) of (\d+)\. (.*)$/gm)];
      expect(cues.map((m) => Number(m[1]))).toEqual(w.steps.map((_, i) => i + 1));
      cues.forEach((m, i) => {
        expect(Number(m[2])).toBe(w.steps.length);
        expect(m[3].startsWith(w.steps[i])).toBe(true);
        expect(m[3].includes("Mocked AI response")).toBe(
          w.mockedSteps?.includes(i + 1) ?? false,
        );
      });
    }
  });
});

describe("README showcase section", () => {
  it("shows every screenshot and links the tour", () => {
    for (const s of SCREENSHOTS) expect(README).toContain(`docs/showcase/${s.id}.png`);
    expect(README).toContain("https://sa-mock-address-generator.vercel.app/tour");
  });

  it("lists each walkthrough's steps exactly as the videos caption them", () => {
    for (const w of WALKTHROUGHS) {
      expect(README).toContain(`docs/showcase/${w.id}.gif`);
      w.steps.forEach((step, i) => expect(README).toContain(`${i + 1}. ${step}`));
    }
  });
});
