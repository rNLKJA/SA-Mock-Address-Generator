/**
 * The guided tour: recorded walkthroughs and key-feature screenshots.
 *
 * One source of truth for the step captions. The Playwright tour
 * (e2e/showcase.spec.ts) shows them as on-screen captions and writes them to
 * WebVTT files, the /tour page lists them under each video, and the README's
 * "Workflow walkthrough" repeats them (src/lib/showcase.test.ts keeps the
 * three in step, and recomputes every number a caption quotes). The media are
 * produced by `pnpm showcase` (scripts/showcase.mjs).
 */
import type { GenerateOptions } from "@/lib/generator/generate";
import type { Proposal } from "@/lib/ai/scenario-config";

export type WalkthroughId =
  "generate-a-test-set" | "did-the-sample-hit-the-target" | "look-up-a-real-address";

export interface Walkthrough {
  id: WalkthroughId;
  title: string;
  /** Route the walkthrough starts on. */
  route: string;
  summary: string;
  /** What is fixed, so the recording can be reproduced by hand. */
  setup: string;
  /** On-screen captions, in order (step k is shown as "k/N"). */
  steps: readonly string[];
  /** Step numbers (1-based) whose caption carries the "mocked AI response" badge. */
  mockedSteps?: readonly number[];
}

/** The test set every walkthrough on /generate uses: 200 addresses, seed 2025. */
export const TOUR_SAMPLE = {
  count: 200,
  seed: 2025,
  mode: "remoteness",
  filters: {},
  coordinates: true,
} as const satisfies Omit<GenerateOptions, "weights">;

/** The first address of TOUR_SAMPLE (with the config.py remoteness weights). */
export const TOUR_FIRST_ADDRESS = "662 Halifax Street, MOUNT BARKER SUMMIT SA 5251";

/** File name the generator gives the CSV download of TOUR_SAMPLE. */
export const TOUR_CSV = "sa-mock-addresses_seed-2025_200.csv";

export const MOCK_LABEL = "Mocked AI response for illustration";

/** Opens every mocked model rationale, so the text itself says what it is. */
export const MOCK_ANSWER_PREFIX = "Mocked response for illustration.";

export const WALKTHROUGHS: readonly Walkthrough[] = [
  {
    id: "generate-a-test-set",
    title: "Generate a test set",
    route: "/generate",
    summary:
      "Two hundred mock addresses weighted by the config.py remoteness weights, with a fixed seed: generated in a Web Worker, mapped inside their suburb boundaries, and downloaded as CSV.",
    setup:
      "200 addresses, Remoteness weights (the config.py defaults: 40 / 25 / 20 / 10 / 5%), seed 2025, coordinates on, no filters. The same settings give the same 200 addresses in any browser.",
    steps: [
      "Generator: the 2025 recipe on the ABS 2021 suburb table, running in your browser",
      "Ask for 200 addresses with the fixed seed 2025: same seed, same list",
      "Weight by remoteness: the config.py weights the 2025 README promised but never applied",
      "Generate: 200 addresses in a Web Worker, each one stamped MOCK",
      "Map: every point is drawn inside its own suburb's ABS boundary",
      "Shade the suburbs by remoteness to see where the sample landed",
      "Choose CSV and download it: 200 rows with suburb, postcode, council and coordinates",
    ],
  },
  {
    id: "did-the-sample-hit-the-target",
    title: "Did the sample hit the target?",
    route: "/generate",
    summary:
      "The same 200 addresses checked against the mix they were drawn to hit: realised shares with 95% Wilson intervals and a goodness-of-fit test with its effect size, then the 2025 uniform generator against the weights its README promised, and the 200-seed study that shows the test is calibrated.",
    setup:
      "200 addresses, seed 2025: first Remoteness weights, then Uniform (as built in 2025). Pearson chi-square test (every expected count is at least 5), Cohen's w for the effect size.",
    steps: [
      "The same test set: 200 addresses, remoteness weights, seed 2025",
      "Target check: each area's realised share with a 95% Wilson interval; the dark tick is the target",
      "Major Cities: 84 of 200 (42%, 95% CI 35.4% to 48.9%) against a 40% target",
      "Pearson chi-square: χ²(4) = 2.77, p = 0.60, Cohen's w = 0.118 (small): on target",
      "Now the 2025 behaviour: uniform weighting, the same seed and the same 200",
      "Against the README's promised weights: χ²(4) = 74.68, p < 0.001, w = 0.611 (large): off target",
      "Show as a table: counts, Wilson intervals, targets and expected counts",
      "Over 200 seeds the test rejects the weighted design in 6 (3.0%, 95% CI 1.4% to 6.4%), near its 5% level",
    ],
  },
  {
    id: "look-up-a-real-address",
    title: "Look up a real address",
    route: "/lookup",
    summary:
      "Search a real place with Photon (OpenStreetMap) through this site's cached route, then find its suburb, postcode, council, remoteness area and SEIFA decile by point-in-polygon in the browser, from the city to the outback and by clicking the map.",
    setup:
      "Live Photon results for “Glenelg Jetty” and “Coober Pedy”; the suburb is found locally against the ABS 2021 boundaries, so a map click works without the geocoder.",
    steps: [
      "Lookup: search a real South Australian place, or click the map",
      "Search “Glenelg Jetty”: Photon (OpenStreetMap) answers through this site's cached route",
      "Pick a result: point-in-polygon against the ABS 2021 boundaries, in your browser",
      "Glenelg: postcode 5045, Holdfast Bay council, Major Cities, IRSAD decile 8 in SA",
      "The jetty sits past the simplified coastline, so the nearest suburb is named, with the distance",
      "Coober Pedy, 751 km from the Adelaide GPO: Very Remote Australia, IRSAD decile 1 in SA",
      "Click anywhere on the map: the lookup works even when the geocoder is offline",
    ],
  },
];

export interface Screenshot {
  /** File name without extension, e.g. "01-landing-light". */
  id: string;
  title: string;
  caption: string;
  viewport: "desktop" | "mobile";
}

export const SCREENSHOTS: readonly Screenshot[] = [
  {
    id: "01-landing-light",
    title: "Landing page",
    caption:
      "Mock addresses with the receipts: a seeded specimen sheet and the features.",
    viewport: "desktop",
  },
  {
    id: "02-landing-dark",
    title: "Landing page, dark mode",
    caption: "The same page in dark mode.",
    viewport: "desktop",
  },
  {
    id: "03-generate-results",
    title: "Generator",
    caption:
      "200 addresses, remoteness weights, seed 2025: settings, MOCK stamp, results.",
    viewport: "desktop",
  },
  {
    id: "04-generate-map",
    title: "The sample on the map",
    caption:
      "Each point drawn inside its suburb's ABS boundary, suburbs shaded by remoteness.",
    viewport: "desktop",
  },
  {
    id: "05-target-check",
    title: "Did the sample hit the target?",
    caption:
      "Realised shares with 95% Wilson intervals, the chosen test, n and Cohen's w.",
    viewport: "desktop",
  },
  {
    id: "06-sampling-designs",
    title: "Three designs over 200 seeds",
    caption:
      "Uniform, weighted and stratified: rejection rates with their own intervals.",
    viewport: "desktop",
  },
  {
    id: "07-sample-size",
    title: "Sample-size calculator",
    caption: "How many addresses a share, a per-area rate or a zero-failure claim needs.",
    viewport: "desktop",
  },
  {
    id: "08-atlas",
    title: "Atlas",
    caption: "All 1,695 suburbs and localities, shaded by SEIFA decile.",
    viewport: "desktop",
  },
  {
    id: "09-lookup",
    title: "Lookup",
    caption: "Photon search, then suburb, postcode, council, remoteness and decile.",
    viewport: "desktop",
  },
  {
    id: "10-replay",
    title: "2025 replay",
    caption: "The original Python CLI ported line by line: same seed, same bytes.",
    viewport: "desktop",
  },
  {
    id: "11-ai-settings",
    title: "Bring your own key",
    caption:
      "AI settings: Anthropic by default, OpenAI optional; the key stays in this browser.",
    viewport: "desktop",
  },
  {
    id: "12-ai-proposal-mocked",
    title: "Describe a scenario (mocked reply)",
    caption:
      "A mocked proposal for illustration: labelled AI-generated, reviewed field by field.",
    viewport: "desktop",
  },
  {
    id: "13-ai-log",
    title: "AI audit log",
    caption:
      "Every AI call with input, output, model, latency and your decision; JSON or CSV.",
    viewport: "desktop",
  },
  {
    id: "14-methods",
    title: "Methods",
    caption:
      "Provenance, evaluation design, limitations, decision records and the AI use statement.",
    viewport: "desktop",
  },
  {
    id: "15-mobile-landing",
    title: "Mobile: landing",
    caption: "The landing page at 390 px.",
    viewport: "mobile",
  },
  {
    id: "16-mobile-target-check",
    title: "Mobile: target check",
    caption: "The interval chart and the verdict on a phone.",
    viewport: "mobile",
  },
  {
    id: "17-mobile-lookup",
    title: "Mobile: lookup",
    caption: "A lookup result on a phone.",
    viewport: "mobile",
  },
  {
    id: "18-verify",
    title: "Verification Lab",
    caption:
      "The 200-address run regenerated from its seed: every check passes, remoteness mix χ²(4) = 2.77.",
    viewport: "desktop",
  },
];

/** Public paths of a walkthrough's media (the files live in web/public/showcase/). */
export function walkthroughMedia(id: WalkthroughId) {
  return {
    mp4: `/showcase/${id}.mp4`,
    poster: `/showcase/${id}-poster.webp`,
    captions: `/showcase/${id}.vtt`,
  };
}

/** Public path of a screenshot's WebP copy, used by /tour. */
export const screenshotSrc = (id: string) => `/showcase/screens/${id}.webp`;

/** Pixel size of the WebP copies (desktop 1440 × 900; mobile 390 × 844 at 1.5×). */
export const SCREENSHOT_SIZE = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 585, height: 1266 },
} as const;

/** The example scenario the screenshots ask the (mocked) assistant about. */
export const MOCK_SCENARIO =
  "A fixture of 40 addresses that covers every remoteness area, as CSV.";

/**
 * The mocked reply to MOCK_SCENARIO (tested against the schema and the
 * reference table in showcase.test.ts). Equal quotas give 8 per area.
 */
export const MOCK_PROPOSAL: Proposal = {
  count: 40,
  seed: null,
  mode: "stratified",
  remoteness_weights: [1, 1, 1, 1, 1],
  decile_weights: null,
  filters: { suburb: null, council: null, remoteness_area: null, seifa_decile: null },
  coordinates: true,
  output_format: "csv",
  rationale: `${MOCK_ANSWER_PREFIX} A stratified design with equal quota shares fixes 8 addresses in each of the five remoteness areas, so every area is covered in a 40-address fixture. CSV as asked; coordinates kept on.`,
  assumptions: [
    "Equal shares: 8 addresses per remoteness area.",
    "The current seed is kept.",
  ],
  unsupported: [],
};
