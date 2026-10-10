/**
 * The guided tour, as an end-to-end test.
 *
 *   pnpm showcase                                   # production, records media
 *   BASE_URL=http://localhost:3000 pnpm showcase    # a local `pnpm build` first
 *   pnpm showcase:test                              # journeys only: no pauses, no video
 *
 * Each journey checks what it shows (the seeded sample, the Wilson interval
 * and test statistics it quotes, the CSV it downloads, the suburb a lookup
 * lands in), so a broken feature fails the tour instead of producing a
 * misleading video. Nothing is random: the generator runs with seed 2025, and
 * the numbers in the captions are recomputed by src/lib/showcase.test.ts.
 *
 * No real API key is used: the AI screenshots type a placeholder, and every
 * request to a provider is answered in the browser by e2e/mock-ai.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  MOCK_ANSWER_PREFIX,
  MOCK_LABEL,
  MOCK_SCENARIO,
  SCREENSHOTS,
  TOUR_CSV,
  TOUR_FIRST_ADDRESS,
  TOUR_SAMPLE,
  WALKTHROUGHS,
  type WalkthroughId,
} from "../src/lib/showcase";
import { PLACEHOLDER_KEY, mockAiProviders } from "./mock-ai";
import {
  FAST,
  SHOT_DIR,
  Tour,
  ensureDirs,
  finishRecording,
  recordingContext,
} from "./showcase-helpers";

const walkthrough = (id: WalkthroughId) => WALKTHROUGHS.find((w) => w.id === id)!;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

/**
 * Viewport screenshot to .showcase/screens/<id>.png, optionally with `align`
 * scrolled to `offset` px from the top (applied twice, after layout settles).
 */
async function shot(page: Page, id: string, align?: { target: Locator; offset: number }) {
  if (!SCREENSHOTS.some((s) => s.id === id)) throw new Error(`Unknown screenshot ${id}`);
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  for (let i = 0; i < 2; i++) {
    if (align) {
      await align.target.evaluate((el, offset) => {
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "instant" });
      }, align.offset);
    }
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `${id}.png`) });
}

/** A visible "mocked" label pinned to the page, for screenshots of mocked AI output. */
async function pinMockLabel(page: Page) {
  await page.evaluate((label) => {
    const el = document.createElement("div");
    el.textContent = label;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;right:24px;top:72px;z-index:2147483647;padding:8px 14px;border-radius:6px;" +
      "background:#f8ecc9;color:#5c3b08;border:2px dashed #a87a12;font:700 15px/1.2 ui-sans-serif,system-ui,sans-serif;" +
      "text-transform:uppercase;letter-spacing:.04em;box-shadow:0 8px 24px rgba(0,0,0,.18)";
    document.body.appendChild(el);
  }, MOCK_LABEL);
}

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// ---------------------------------------------------------------------------- generator

const gen = {
  count: (page: Page) => page.getByLabel("How many"),
  seed: (page: Page) => page.getByLabel("Seed", { exact: true }),
  mode: (page: Page, name: string) => page.getByRole("radio", { name }),
  submit: (page: Page) => page.getByRole("button", { name: "Generate addresses" }),
  status: (page: Page) =>
    page.locator("p[aria-live=polite]").filter({ hasText: /addresses · seed/ }),
  tab: (page: Page, name: string) => page.getByRole("tab", { name, exact: true }),
  tabs: (page: Page) => page.getByRole("tablist"),
  map: (page: Page) => page.getByRole("region", { name: /^Map of \d+ generated mock/ }),
  verdict: (page: Page) =>
    page.locator("div[id$=-summary]").filter({ hasText: /χ²|Fixed by design/ }),
  row: (page: Page, area: string) =>
    page.getByRole("group", { name: new RegExp(`^${area}: `) }),
  rowNote: (page: Page) => page.locator("figure p[aria-live=polite]"),
};

const GPO = [138.5999, -34.9255] as const;
/** Double-click zooms on Adelaide before opening a point. */
const MAP_ZOOMS = 5;

type Px = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

/**
 * Centres of the generated points (light-theme fill #b8292f) drawn on the map,
 * in page pixels, from a screenshot with the tour overlay hidden.
 */
async function findDots(page: Page, box: Box): Promise<Px[]> {
  const overlay = page.locator("#__showcase-overlay");
  const hasOverlay = (await overlay.count()) > 0;
  if (hasOverlay) await overlay.evaluate((el) => (el.style.visibility = "hidden"));
  const png = await page.screenshot({ clip: box });
  if (hasOverlay) await overlay.evaluate((el) => (el.style.visibility = ""));
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const scale = width / box.width;
  const red = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = [
      data[i * channels],
      data[i * channels + 1],
      data[i * channels + 2],
    ];
    red[i] = Math.abs(r - 184) < 36 && g < 90 && b < 95 && r - g > 90 ? 1 : 0;
  }
  const dots: Px[] = [];
  const stack: number[] = [];
  for (let start = 0; start < red.length; start++) {
    if (!red[start]) continue;
    let n = 0;
    let sx = 0;
    let sy = 0;
    red[start] = 0;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      n++;
      sx += x;
      sy += y;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (j >= 0 && j < red.length && red[j] && Math.abs((j % width) - x) <= 1) {
          red[j] = 0;
          stack.push(j);
        }
      }
    }
    if (n >= 12 * scale * scale)
      dots.push({ x: box.x + sx / n / scale, y: box.y + sy / n / scale });
  }
  if (!dots.length) throw new Error("No generated points found on the map");
  return dots;
}

const dist = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y);

/** The pixel nearest `target` (kept 80 px inside the map) with no point within 14 px. */
function freeSpotNear(target: Px, dots: Px[], box: Box): Px {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const c = {
    x: clamp(target.x, box.x + 80, box.x + box.width - 80),
    y: clamp(target.y, box.y + 80, box.y + box.height - 80),
  };
  for (let r = 0; r <= 60; r += 3) {
    for (let a = 0; a < 360; a += r === 0 ? 360 : 15) {
      const p = {
        x: c.x + r * Math.cos((a * Math.PI) / 180),
        y: c.y + r * Math.sin((a * Math.PI) / 180),
      };
      if (dots.every((d) => dist(d, p) > 14)) return p;
    }
  }
  throw new Error("No free spot to zoom on");
}

/** The point nearest `target` with no other point within 16 px (so a click opens it). */
function isolatedDotNear(target: Px, dots: Px[]): Px {
  const isolated = dots.filter((d) => dots.every((o) => o === d || dist(o, d) > 16));
  if (!isolated.length) throw new Error("No isolated point on the map");
  return isolated.reduce((a, b) => (dist(b, target) < dist(a, target) ? b : a));
}

const RESULT_TEXT = {
  remoteness: /^200 addresses · seed 2025 · Remoteness weights · /,
  uniform: /^200 addresses · seed 2025 · Uniform \(as built in 2025\) · /,
};

async function generatorReady(page: Page) {
  await expect(h1(page)).toHaveText("Generate mock South Australian addresses");
  // the first sample (25 addresses, uniform) is generated on load
  await expect(gen.status(page)).toHaveText(/^25 addresses · seed 2025 · /, {
    timeout: 60_000,
  });
}

/** Fill the form for TOUR_SAMPLE without pauses (screenshots and fast runs). */
async function quickTourSample(page: Page, mode = "Remoteness weights") {
  await gen.count(page).fill(String(TOUR_SAMPLE.count));
  await gen.seed(page).fill(String(TOUR_SAMPLE.seed));
  await gen.mode(page, mode).check();
  await gen.submit(page).click();
}

async function mapReady(region: Locator) {
  await expect(region).toBeVisible({ timeout: 60_000 });
  const frame = region.locator("xpath=..");
  await expect(frame.getByText("Loading map…")).toBeHidden({ timeout: 60_000 });
  await expect(region.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  // let the basemap tiles and the suburb layer draw
  await region.page().waitForTimeout(FAST ? 800 : 2500);
}

/** Pixel position of `lonLat` on a MapLibre map fitted to the SA bounding box (padding 16). */
function mapPixel(box: Box, lonLat: readonly [number, number]): Px {
  const merc = ([lon, lat]: readonly [number, number]) => {
    const phi = (lat * Math.PI) / 180;
    return {
      x: (lon + 180) / 360,
      y: (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2,
    };
  };
  const sw = merc([128.9, -38.2]);
  const ne = merc([141.1, -25.9]);
  const scale = Math.min(
    (box.width - 32) / (ne.x - sw.x),
    (box.height - 32) / (sw.y - ne.y),
  );
  const p = merc(lonLat);
  return {
    x: box.x + box.width / 2 + (p.x - (sw.x + ne.x) / 2) * scale,
    y: box.y + box.height / 2 + (p.y - (sw.y + ne.y) / 2) * scale,
  };
}

// ---------------------------------------------------------------------------- lookup

const lookup = {
  input: (page: Page) =>
    page.getByLabel("Search a real South Australian place or address"),
  results: (page: Page) => page.getByRole("list", { name: "Search results" }),
  result: (page: Page, name: RegExp) =>
    lookup.results(page).getByRole("button", { name }).first(),
  card: (page: Page) => page.getByRole("region", { name: "Lookup result" }),
  map: (page: Page) => page.getByRole("region", { name: /^Map of South Australia\./ }),
};

async function expectSuburb(
  page: Page,
  s: { name: string; postcode: string; council: string; ra: string; decile: string },
) {
  const card = lookup.card(page);
  await expect(card.getByRole("heading", { level: 3 })).toHaveText(s.name);
  await expect(card).toContainText(`Postcode (POA)${s.postcode}`);
  await expect(card).toContainText(`Council (LGA)${s.council}`);
  await expect(card).toContainText(`Remoteness${s.ra}`);
  await expect(card).toContainText(`IRSAD decile${s.decile}`);
  return card;
}

const GLENELG = {
  name: "Glenelg",
  postcode: "5045",
  council: "Holdfast Bay",
  ra: "Major Cities of Australia",
  decile: "8 in SA",
};
const COOBER_PEDY = {
  name: "Coober Pedy",
  postcode: "5723",
  council: "Coober Pedy",
  ra: "Very Remote Australia",
  decile: "1 in SA",
};

test.beforeAll(() => ensureDirs());

test.describe("journeys (recorded)", () => {
  test("1. generate a test set: 200 addresses by remoteness, mapped, as CSV", async ({
    browser,
  }) => {
    const context = await recordingContext(browser);
    const page = await context.newPage();
    const tour = new Tour(page, walkthrough("generate-a-test-set"));

    await page.goto("/generate");
    await generatorReady(page);
    await settle(page);
    tour.markStart();

    await tour.caption(1);
    await tour.pause(1200);
    await tour.hover(page.getByRole("heading", { name: "Settings" }), 800);
    await tour.pause(700);
    await tour.hover(page.getByText("MOCK: synthetic test data."), 900);
    await tour.pause(1500);

    await tour.caption(2, { align: "right" });
    await tour.type(gen.count(page), "200");
    await expect(gen.count(page)).toHaveValue("200");
    await tour.pause(500);
    await tour.type(gen.seed(page), "2025");
    await expect(gen.seed(page)).toHaveValue("2025");
    await tour.hover(page.getByText("Same seed and settings, same output"), 700);
    await tour.pause(1300);

    await tour.caption(3, { align: "right" });
    await tour.click(gen.mode(page, "Remoteness weights"));
    await expect(gen.mode(page, "Remoteness weights")).toBeChecked();
    const weights = page.getByRole("group", { name: "Remoteness weights", exact: true });
    await tour.pause(600);
    await tour.hover(weights, 900);
    await tour.pause(1800);

    await tour.caption(4, { align: "right" });
    await tour.click(gen.submit(page), { after: 0 });
    await tour.idleWhile(() =>
      expect(gen.status(page)).toHaveText(RESULT_TEXT.remoteness, { timeout: 60_000 }),
    );
    await tour.pause(600);
    await tour.hover(gen.status(page), 800);
    await tour.pause(1000);
    const tags = page
      .getByRole("list", { name: "Generated mock addresses" })
      .getByRole("listitem");
    // the list shows 100 at a time; the download has all 200
    await expect(tags).toHaveCount(100);
    await expect(
      page.getByText("Showing 100 of 200. The download has them all."),
    ).toBeVisible();
    await expect(tags.first()).toContainText(TOUR_FIRST_ADDRESS);
    await tour.hover(tags.first(), 800);
    await tour.pause(1600);

    await tour.caption(5, { align: "right" });
    await tour.scrollTo(gen.tabs(page), { offset: 76, ms: 900 });
    await tour.click(gen.tab(page, "Map"), { scroll: false });
    const map = gen.map(page);
    await tour.idleWhile(() => mapReady(map));
    await expect(map).toHaveAccessibleName("Map of 200 generated mock addresses");
    const box = (await map.boundingBox())!;
    await tour.hover(map, 900, { scroll: false });
    await tour.pause(1200);
    // Zoom in on Adelaide with double-clicks, each on a spot with no point
    // under it (a click on a point opens its popup), then open the isolated
    // point nearest the GPO. Points are found in a screenshot of the map.
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // pan Adelaide to the middle of the map first
    await tour.drag(mapPixel(box, GPO), centre);
    let gpo = centre;
    for (let i = 0; i < MAP_ZOOMS; i++) {
      const spot = freeSpotNear(gpo, await findDots(page, box), box);
      await tour.glide(spot.x, spot.y, 500);
      await tour.pause(250);
      await page.mouse.dblclick(spot.x, spot.y);
      await page.waitForTimeout(FAST ? 700 : 1000);
      gpo = { x: spot.x + (gpo.x - spot.x) * 2, y: spot.y + (gpo.y - spot.y) * 2 };
    }
    await tour.pause(800);
    const dot = isolatedDotNear(gpo, await findDots(page, box));
    await tour.glide(dot.x, dot.y, 900);
    await tour.pause(400);
    await page.mouse.click(dot.x, dot.y);
    const popup = page
      .locator(".maplibregl-popup-content")
      .filter({ hasText: "MOCK · " });
    await expect(popup).toHaveCount(1);
    await expect(popup).toContainText(/^MOCK · \d{1,3} .+ SA \d{4}/);
    await tour.pause(2600);

    await tour.caption(6, { align: "right" });
    await tour.click(
      page
        .getByRole("radiogroup", { name: "Shade suburbs by" })
        .getByRole("radio", { name: "Remoteness" }),
    );
    await tour.pause(800);
    await tour.hover(map, 900, { scroll: false });
    await tour.pause(2200);

    await tour.caption(7, { align: "right" });
    await tour.scrollTo(page.getByRole("heading", { name: "Results" }), {
      offset: 84,
      ms: 900,
    });
    await tour.click(
      page
        .getByRole("radiogroup", { name: "Output format" })
        .getByRole("radio", { name: "CSV" }),
    );
    await tour.click(gen.tab(page, "Raw output"));
    const raw = page.getByLabel("CSV output preview");
    await expect(raw).toContainText("id,stamp,full_address,street_address");
    await tour.pause(600);
    await tour.hover(raw, 900);
    await tour.pause(1200);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      tour.click(page.getByRole("button", { name: "Download" })),
    ]);
    expect(download.suggestedFilename()).toBe(TOUR_CSV);
    const csv = readFileSync((await download.path())!, "utf8")
      .trim()
      .split(/\r?\n/);
    expect(csv).toHaveLength(TOUR_SAMPLE.count + 1);
    expect(csv[0]).toBe(
      "id,stamp,full_address,street_address,street_number,street_name,suburb,postcode,council,remoteness_level,seifa_decile_sa,latitude,longitude,sal_code",
    );
    expect(csv[1]).toContain(TOUR_FIRST_ADDRESS);
    await tour.pause(2400);

    await finishRecording(context, page, tour);
  });

  test("2. did the sample hit the target: intervals, the test and the 2025 behaviour", async ({
    browser,
  }) => {
    const context = await recordingContext(browser);
    const page = await context.newPage();
    const tour = new Tour(page, walkthrough("did-the-sample-hit-the-target"));

    await page.goto("/generate");
    await generatorReady(page);
    await settle(page);
    tour.markStart();

    await tour.caption(1, { align: "right" });
    await tour.pause(900);
    await tour.type(gen.count(page), "200");
    await tour.click(gen.mode(page, "Remoteness weights"));
    await tour.pause(300);
    await tour.click(gen.submit(page), { after: 0 });
    await tour.idleWhile(() =>
      expect(gen.status(page)).toHaveText(RESULT_TEXT.remoteness, { timeout: 60_000 }),
    );
    await tour.pause(500);
    await tour.hover(gen.status(page), 800);
    await tour.pause(1400);

    await tour.caption(2, { align: "right" });
    await tour.scrollTo(gen.tabs(page), { offset: 76, ms: 900 });
    await tour.click(gen.tab(page, "Target check"), { scroll: false });
    const figure = page.locator("figure").filter({ hasText: "Realised share" });
    await expect(figure).toBeVisible();
    await tour.pause(700);
    await tour.hover(figure.getByText("95% interval", { exact: true }), 800);
    await tour.pause(1000);
    await tour.hover(figure.getByText("Target", { exact: true }), 700);
    await tour.pause(1400);

    await tour.caption(3, { align: "right" });
    await tour.hover(gen.row(page, "Major Cities"), 900);
    await expect(gen.rowNote(page)).toHaveText(
      "Major Cities: 84 of 200 addresses (42%, 95% CI 35.4% to 48.9%). Target 40%, so about 80 expected.",
    );
    await tour.pause(2400);
    await tour.hover(gen.row(page, "Very Remote"), 800);
    await expect(gen.rowNote(page)).toHaveText(/^Very Remote: 8 of 200 addresses \(4%/);
    await tour.pause(1600);

    await tour.caption(4, { align: "right" });
    const verdict = gen.verdict(page);
    await expect(verdict).toContainText(
      "On target. Pearson chi-square test: p = 0.60 (χ²(4) = 2.77, n = 200, Cohen's w = 0.118, small). Consistent with the target",
    );
    await tour.hover(verdict, 900);
    await tour.pause(3000);

    await tour.caption(5, { align: "right" });
    await tour.scrollToY(0, 900);
    await tour.click(gen.mode(page, "Uniform (as built in 2025)"));
    await expect(gen.mode(page, "Uniform (as built in 2025)")).toBeChecked();
    await tour.pause(500);
    await tour.click(gen.submit(page), { after: 0 });
    await tour.idleWhile(() =>
      expect(gen.status(page)).toHaveText(RESULT_TEXT.uniform, { timeout: 60_000 }),
    );
    await tour.pause(400);
    await tour.hover(gen.status(page), 800);
    await tour.pause(1400);

    await tour.caption(6, { align: "right" });
    await tour.scrollTo(gen.tabs(page), { offset: 76, ms: 900 });
    await tour.click(page.getByRole("radio", { name: "README promise (config.py)" }), {
      scroll: false,
    });
    await expect(verdict).toContainText(
      "Off target. Pearson chi-square test: p < 0.001 (χ²(4) = 74.68, n = 200, Cohen's w = 0.611, large). The sample departs from this target by more than chance would explain.",
    );
    await tour.pause(600);
    await tour.hover(gen.row(page, "Major Cities"), 900);
    await expect(gen.rowNote(page)).toHaveText(
      /^Major Cities: 38 of 200 addresses \(19%/,
    );
    await tour.pause(2000);
    await tour.hover(verdict, 900);
    await tour.pause(2600);

    await tour.caption(7, { align: "right" });
    const details = page.getByText("Show as a table", { exact: true });
    await tour.click(details);
    const table = page.getByRole("region", { name: /^Target check table/ });
    await expect(table.getByRole("table")).toBeVisible();
    await expect(table).toContainText("95% Wilson CI");
    await tour.pause(500);
    await tour.scrollTo(table, { offset: 200, ms: 900 });
    await tour.hover(table.getByRole("columnheader", { name: "95% Wilson CI" }), 800);
    await tour.pause(1200);
    await tour.hover(table.getByRole("columnheader", { name: "Expected" }), 800);
    await tour.pause(1800);

    await tour.caption(8);
    await tour.scrollToY(0, 800);
    await tour.click(mainNav(page).getByRole("link", { name: "Sampling" }), {
      scroll: false,
    });
    await expect(page).toHaveURL(/\/sampling$/);
    await expect(h1(page)).toHaveText("Does each design deliver the mix it promises?");
    await settle(page);
    await tour.scrollTo(page.locator("#designs"), { offset: 90, ms: 1300 });
    const weighted = page.getByText("6 of 200, 3.0% (95% CI 1.4% to 6.4%)");
    await expect(weighted).toBeVisible();
    await tour.pause(600);
    await tour.hover(page.getByText("200 of 200, 100.0% (95% CI 98.1% to 100.0%)"), 800);
    await tour.pause(1800);
    await tour.hover(weighted, 900);
    await tour.pause(3000);

    await finishRecording(context, page, tour);
  });

  test("3. look up a real address: Photon, then suburb, council, remoteness and decile", async ({
    browser,
  }) => {
    const context = await recordingContext(browser);
    const page = await context.newPage();
    const tour = new Tour(page, walkthrough("look-up-a-real-address"));

    await page.goto("/lookup");
    await expect(h1(page)).toHaveText("Which suburb is this point in?");
    await mapReady(lookup.map(page));
    await settle(page);
    tour.markStart();

    await tour.caption(1);
    await tour.pause(1000);
    await tour.hover(lookup.input(page), 800);
    await tour.pause(900);
    await tour.hover(lookup.map(page), 900);
    await tour.pause(1400);

    await tour.caption(2);
    await tour.type(lookup.input(page), "Glenelg Jetty");
    await page.keyboard.press("Enter");
    const jetty = lookup.result(page, /^Glenelg Jetty/);
    await tour.idleWhile(() => expect(jetty).toBeVisible({ timeout: 30_000 }));
    await tour.pause(500);
    await tour.hover(lookup.results(page), 900);
    await tour.pause(1600);

    await tour.caption(3);
    await tour.click(jetty);
    await tour.idleWhile(() =>
      expect(lookup.card(page).getByRole("heading", { level: 3 })).toBeVisible({
        timeout: 60_000,
      }),
    );
    await tour.pause(800);
    await tour.hover(lookup.map(page), 900);
    await tour.pause(1600);

    await tour.caption(4);
    const card = await expectSuburb(page, GLENELG);
    for (const label of [
      "Postcode (POA)",
      "Council (LGA)",
      "Remoteness",
      "IRSAD decile",
    ]) {
      await tour.hover(card.getByText(label, { exact: true }), 700);
      await tour.pause(700);
    }
    await tour.pause(1000);

    await tour.caption(5);
    const offshore = card.getByText(/just outside the simplified coastline/);
    await expect(offshore).toContainText(/nearest suburb \(\d+ m away\)/);
    await tour.hover(offshore, 800);
    await tour.pause(1800);
    await tour.hover(lookup.map(page), 900);
    await tour.pause(1600);

    await tour.caption(6);
    await tour.click(page.getByRole("button", { name: "Coober Pedy", exact: true }));
    const town = lookup.result(page, /^Coober Pedy\s*5723/);
    await tour.idleWhile(() => expect(town).toBeVisible({ timeout: 30_000 }));
    await tour.pause(400);
    await tour.click(town);
    await expectSuburb(page, COOBER_PEDY);
    const distance = lookup.card(page).getByText(/751 km from the Adelaide GPO/);
    await expect(distance).toBeVisible();
    await tour.pause(800);
    await tour.hover(distance, 800);
    await tour.pause(1200);
    await tour.hover(lookup.card(page).getByText("Very Remote Australia"), 800);
    await tour.pause(1000);
    await tour.hover(lookup.card(page).getByText(/^1 in SA/), 700);
    await tour.pause(1600);

    await tour.caption(7);
    // let the fly-to Coober Pedy finish, zoom out once, then drop a pin
    // outside Coober Pedy's boundary
    await page.waitForTimeout(1000);
    await tour.click(page.getByRole("button", { name: "Zoom out" }), { scroll: false });
    await page.waitForTimeout(FAST ? 400 : 900);
    const mapBox = (await lookup.map(page).boundingBox())!;
    const pin = { x: mapBox.x + mapBox.width * 0.16, y: mapBox.y + mapBox.height * 0.3 };
    await tour.glide(pin.x, pin.y, 900);
    await tour.pause(400);
    await page.mouse.click(pin.x, pin.y);
    await expect(lookup.card(page).getByText("Dropped pin")).toBeVisible();
    await expect(lookup.card(page).getByText("Map click", { exact: true })).toBeVisible();
    await expect(lookup.card(page).getByRole("heading", { level: 3 })).not.toHaveText(
      "Coober Pedy",
    );
    await expect(
      lookup
        .card(page)
        .getByRole("heading", { level: 3 })
        .or(
          lookup
            .card(page)
            .getByText(/more than 2 km from every South Australian suburb/),
        ),
    ).toBeVisible();
    await tour.pause(1400);
    await tour.hover(lookup.card(page).getByText("Dropped pin"), 800);
    await tour.pause(2800);

    await finishRecording(context, page, tour);
  });
});

async function desktop(browser: Browser, colorScheme: "light" | "dark" = "light") {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme,
  });
}

async function mobile(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
}

test.describe("screenshots", () => {
  test("landing, light and dark", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const context = await desktop(browser, scheme);
      const page = await context.newPage();
      await page.goto("/");
      await expect(h1(page)).toHaveText(
        "Mock South Australian addresses, with the receipts.",
      );
      await settle(page);
      await shot(page, `0${scheme === "light" ? 1 : 2}-landing-${scheme}`);
      await context.close();
    }
  });

  test("key features at 1440 × 900", async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const context = await desktop(browser);
    const ai = await mockAiProviders(context, { latencyMs: 0 });
    const page = await context.newPage();

    // generator: results, map, target check
    await page.goto("/generate");
    await generatorReady(page);
    await quickTourSample(page);
    await expect(gen.status(page)).toHaveText(RESULT_TEXT.remoteness, {
      timeout: 60_000,
    });
    await settle(page);
    await shot(page, "03-generate-results", {
      target: page.getByRole("note").filter({ hasText: "MOCK: synthetic test data." }),
      offset: 76,
    });

    await gen.tab(page, "Map").click();
    await mapReady(gen.map(page));
    await page
      .getByRole("radiogroup", { name: "Shade suburbs by" })
      .getByRole("radio", { name: "Remoteness" })
      .click();
    await page.waitForTimeout(1500);
    await shot(page, "04-generate-map", { target: gen.tabs(page), offset: 72 });

    await gen.tab(page, "Target check").click();
    await expect(gen.verdict(page)).toContainText("χ²(4) = 2.77");
    await shot(page, "05-target-check", { target: gen.tabs(page), offset: 72 });

    // sampling design and sample size
    await page.goto("/sampling");
    await settle(page);
    await shot(page, "06-sampling-designs", {
      target: page.locator("#designs"),
      offset: 90,
    });
    await shot(page, "07-sample-size", {
      target: page.locator("#sample-size"),
      offset: 90,
    });

    // atlas, shaded by SEIFA
    await page.goto("/map");
    const atlas = page.getByRole("region", { name: /^Map of South Australia/ });
    await mapReady(atlas);
    await page.getByRole("radio", { name: "SEIFA" }).click();
    await page.waitForTimeout(1500);
    await shot(page, "08-atlas", { target: h1(page), offset: 108 });

    // lookup: Coober Pedy
    await page.goto("/lookup");
    await mapReady(lookup.map(page));
    await page.getByRole("button", { name: "Coober Pedy", exact: true }).click();
    await lookup.result(page, /^Coober Pedy\s*5723/).click();
    await expectSuburb(page, COOBER_PEDY);
    await page.waitForTimeout(1500);
    // the suburb card's bottom just above the fold, the sticky map beside it
    const cardHeight = (await lookup.card(page).boundingBox())!.height;
    await shot(page, "09-lookup", {
      target: lookup.card(page),
      offset: 876 - cardHeight,
    });

    // 2025 replay
    await page.goto("/replay");
    await expect(
      page.getByLabel("Terminal output of the replayed command"),
    ).not.toBeEmpty();
    await settle(page);
    await shot(page, "10-replay", { target: h1(page), offset: 108 });

    // bring your own key (placeholder only), then a mocked proposal
    await page.goto("/generate");
    await generatorReady(page);
    await settle(page);
    const panel = page.getByRole("button", { name: /Describe a test scenario/ });
    await panel.click();
    await page.getByRole("button", { name: "Add your API key" }).click();
    const dialog = page.getByRole("dialog", { name: "AI settings" });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "11-ai-settings");
    await dialog.getByLabel("Anthropic API key").fill(PLACEHOLDER_KEY);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: MOCK_SCENARIO }).click();
    await page.getByRole("button", { name: "Propose settings" }).click();
    const proposal = page
      .locator("div[aria-live=polite]")
      .filter({ hasText: "AI-generated" });
    await expect(proposal).toContainText(MOCK_ANSWER_PREFIX);
    await expect(
      proposal.getByRole("button", { name: /^Apply \d+ of \d+$/ }),
    ).toBeVisible();
    await pinMockLabel(page);
    await shot(page, "12-ai-proposal-mocked", { target: panel, offset: 76 });
    await proposal.getByRole("button", { name: /^Apply \d+ of \d+$/ }).click();
    await expect(proposal.getByText("Applied", { exact: true })).toBeVisible();

    await page.goto("/ai-log");
    await expect(page.getByText(/1 AI call/)).toBeVisible();
    await settle(page);
    const entry = page.getByText("Input, output and decision").first();
    await entry.click();
    await pinMockLabel(page);
    await shot(page, "13-ai-log", { target: h1(page), offset: 108 });

    // forget the placeholder key again
    await page.getByRole("button", { name: /^AI settings/ }).click();
    await dialog.getByRole("button", { name: "Forget key" }).click();
    await expect(
      dialog.getByText("Anthropic key removed from this browser."),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/methods");
    await settle(page);
    await shot(page, "14-methods");

    expect(ai.calls).toBe(1);
    expect(ai.leaks, "the placeholder key must only go to the (mocked) provider").toEqual(
      [],
    );
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain(PLACEHOLDER_KEY);
    await context.close();
  });

  test("verification lab at 1440 × 900", async ({ browser }) => {
    test.setTimeout(3 * 60_000);
    const context = await desktop(browser);
    const page = await context.newPage();
    await page.goto("/generate");
    await generatorReady(page);
    await quickTourSample(page);
    await expect(gen.status(page)).toHaveText(RESULT_TEXT.remoteness, {
      timeout: 60_000,
    });
    await page.getByRole("link", { name: "Verify these results" }).click();
    const summary = page.locator('section[aria-label="Verification summary"]');
    await expect(summary).toHaveAttribute("data-verdict", "pass", { timeout: 60_000 });
    await expect(summary).toContainText("16 record-level checks on 200 rows");
    await expect(page.locator('article[data-status="pass"]')).toHaveCount(4);
    await settle(page);
    await shot(page, "18-verify", {
      target: page.getByRole("heading", { name: "Set-level checks" }),
      offset: 76,
    });
    await context.close();
  });

  test("mobile at 390 × 844", async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const context = await mobile(browser);
    const page = await context.newPage();

    await page.goto("/");
    await settle(page);
    await shot(page, "15-mobile-landing");

    await page.goto("/generate");
    await generatorReady(page);
    await quickTourSample(page);
    await expect(gen.status(page)).toHaveText(RESULT_TEXT.remoteness, {
      timeout: 60_000,
    });
    await gen.tab(page, "Target check").click();
    await expect(gen.verdict(page)).toContainText("χ²(4) = 2.77");
    await settle(page);
    await shot(page, "16-mobile-target-check", { target: gen.tabs(page), offset: 64 });

    await page.goto("/lookup");
    await mapReady(lookup.map(page));
    await page.getByRole("button", { name: "Coober Pedy", exact: true }).click();
    await lookup.result(page, /^Coober Pedy\s*5723/).click();
    await expectSuburb(page, COOBER_PEDY);
    await shot(page, "17-mobile-lookup", { target: lookup.card(page), offset: 64 });
    await context.close();
  });
});
