/**
 * The Verification Lab (/verify) end to end, at 1440 × 900 and 390 × 844:
 * arrive from /generate with "Verify these results", see every record- and
 * set-level check render with its numbers, with no console errors and no
 * sideways overflow. Then a pasted CSV with deliberately broken rows, and the
 * optional live spot check (desktop only: it calls Photon through the site's
 * /api/geocode proxy).
 *
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/verify.spec.ts   # after pnpm build
 *   npx playwright test e2e/verify.spec.ts                                  # production
 */
import { expect, test, type Page } from "@playwright/test";

const RECORD_CHECKS = [
  "required-fields",
  "mock-stamp",
  "address-format",
  "street-number",
  "street-name",
  "state-is-sa",
  "postcode-range",
  "suburb-in-reference",
  "postcode-matches-suburb",
  "council-matches",
  "remoteness-matches",
  "irsad-matches",
  "point-in-suburb",
  "point-in-sa",
  "no-duplicate-addresses",
  "no-duplicate-coordinates",
];
const SET_CHECKS = [
  "distribution-remoteness",
  "distribution-decile",
  "spatial-spread",
  "reproducibility",
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function expectNoOverflow(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll, "page is wider than the viewport").toBeLessThanOrEqual(width);
}

const setCheck = (page: Page, id: string) =>
  page.locator(`article[data-check-id="${id}"]`);
const recordCheck = (page: Page, id: string) => page.locator(`li[data-check-id="${id}"]`);

for (const viewport of [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
]) {
  test.describe(`/verify at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test("arrive from /generate and see every check with numbers", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchConsole(page);

      await page.goto("/generate");
      await expect(
        page.locator("p[aria-live=polite]").filter({ hasText: /addresses · seed/ }),
      ).toHaveText(/^25 addresses · seed 2025 · /, { timeout: 60_000 });
      const link = page.getByRole("link", { name: "Verify these results" });
      await expect(link).toHaveAttribute(
        "href",
        "/verify?seed=2025&count=25&mode=uniform",
      );
      await link.click();

      await expect(page).toHaveURL(/\/verify\?seed=2025&count=25&mode=uniform$/);
      // (the /generate page stays in the DOM, hidden, after a client-side navigation)
      await expect(
        page.getByRole("heading", { level: 1, name: "Verify a generated set" }),
      ).toBeVisible();
      const summary = page.locator('section[aria-label="Verification summary"]');
      await expect(summary).toBeVisible({ timeout: 60_000 });
      await expect(summary).toHaveAttribute("data-verdict", "pass");
      await expect(summary).toContainText("Every check passed.");

      // the carried-over settings
      const handoff = page.locator("section").filter({ hasText: "Run from Generate" });
      await expect(handoff).toContainText("2025");
      await expect(handoff).toContainText("Uniform (as built in 2025)");

      // every record-level check, 25 passed
      for (const id of RECORD_CHECKS) {
        const row = recordCheck(page, id);
        await expect(row, id).toHaveAttribute("data-status", "pass");
        await expect(row, id).toContainText(/2\d passed/);
        await expect(row, id).toContainText("0 failed");
      }
      await expect(page.locator("li[data-check-id]")).toHaveCount(RECORD_CHECKS.length);

      // every set-level check, with its numbers
      await expect(page.locator("article[data-check-id]")).toHaveCount(SET_CHECKS.length);
      for (const id of SET_CHECKS)
        await expect(setCheck(page, id), id).toHaveAttribute("data-status", "pass");
      const ra = setCheck(page, "distribution-remoteness");
      await expect(ra).toContainText(/χ²\(4\) = \d+\.\d\d/);
      await expect(ra).toContainText(/Cohen's w = \d\.\d{3}/);
      await expect(ra).toContainText("Degrees of freedom");
      await expect(ra).toContainText("95% Wilson interval");
      await expect(ra.locator("tbody tr")).toHaveCount(5);
      await expect(ra.locator("tbody tr").first()).toContainText(/\d+\.\d% to \d+\.\d%/);
      await expect(ra).toContainText(/Holm-adjusted p = \d/);
      const dec = setCheck(page, "distribution-decile");
      await expect(dec).toContainText(/χ²\(10\) = \d+\.\d\d/);
      await expect(dec.locator("tbody tr")).toHaveCount(11);
      const spatial = setCheck(page, "spatial-spread");
      await expect(spatial).toContainText(/Mean nearest-neighbour distance \d+\.\d+ km/);
      await expect(spatial).toContainText(/ratio R = \d\.\d{3}/);
      await expect(spatial).toContainText("Known limitation.");
      await expect(spatial).toContainText("Donnelly");
      await expect(spatial).toContainText("one address per suburb nothing here flags it");
      for (const text of await page.locator("article[data-check-id]").allInnerTexts())
        expect(text).not.toContain("p-value p-value");
      const repro = setCheck(page, "reproducibility");
      await expect(repro).toContainText("byte-identical CSV");
      await expect(repro).toContainText(/SHA-256 A: [0-9a-f]{64}/);
      await expect(repro).toContainText(/SHA-256 B: [0-9a-f]{64}/);

      // the report downloads
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Report (Markdown)" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(
        /^verification-report_seed-2025_.*\.md$/,
      );

      // the spot check is off by default: nothing sent, no button yet
      await expect(page.getByRole("switch", { name: "Turn on" })).not.toBeChecked();
      await expect(page.getByTestId("spot-check")).toHaveCount(0);

      await page.waitForTimeout(500);
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    });

    test("a pasted CSV with broken rows lists them", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchConsole(page);
      await page.goto("/verify");
      await expect(page.getByText("Arrive from Generate")).toBeVisible();

      // Four consistent rows built from the site's own reference table, then two broken.
      const csv = await page.evaluate(async () => {
        const res = await fetch("/data/suburbs.json");
        const { rows } = (await res.json()) as {
          rows: {
            code: string;
            name: string;
            postcode: string;
            council: string;
            ra: number;
            decileSa: number | null;
            label: [number, number];
          }[];
        };
        const ra = [
          "Major Cities of Australia",
          "Inner Regional Australia",
          "Outer Regional Australia",
          "Remote Australia",
          "Very Remote Australia",
        ];
        const pick = ["ADELAIDE", "GLENELG", "COOBER PEDY", "MOUNT GAMBIER"].map((n) =>
          rows.find((r) => r.name === n)!,
        );
        const lines = [
          "id,stamp,full_address,street_address,street_number,street_name,suburb,postcode,council,remoteness_level,seifa_decile_sa,latitude,longitude,sal_code",
        ];
        pick.forEach((s, i) => {
          const n = 10 + i;
          lines.push(
            [
              i + 1,
              "MOCK: synthetic test data",
              `"${n} Main Street, ${s.name} SA ${s.postcode}"`,
              `${n} Main Street`,
              n,
              "Main Street",
              s.name,
              s.postcode,
              s.council,
              ra[s.ra],
              s.decileSa ?? "",
              s.label[1],
              s.label[0],
              s.code,
            ].join(","),
          );
        });
        // row 2: wrong remoteness class (valid name, wrong for Glenelg)
        lines[2] = lines[2].replace("Major Cities of Australia", "Remote Australia");
        // row 3: a point in Melbourne
        lines[3] = lines[3].replace(
          /,-?\d+\.\d+,\d+\.\d+,(\d+)$/,
          ",-37.8136,144.9631,$1",
        );
        return lines.join("\n");
      });
      await page.getByLabel("CSV in the site's export format").fill(csv);
      await page.getByRole("button", { name: "Verify CSV" }).click();

      const summary = page.locator('section[aria-label="Verification summary"]');
      await expect(summary).toHaveAttribute("data-verdict", "fail", { timeout: 60_000 });
      await expect(recordCheck(page, "remoteness-matches")).toHaveAttribute(
        "data-status",
        "fail",
      );
      await expect(recordCheck(page, "remoteness-matches")).toContainText(
        'Row 2: "Remote Australia", reference "Major Cities of Australia"',
      );
      await expect(recordCheck(page, "point-in-suburb")).toContainText(
        "Row 3: (-37.8136, 144.9631) is outside COOBER PEDY",
      );
      await expect(recordCheck(page, "point-in-sa")).toContainText(
        "is in no South Australian suburb",
      );
      await expect(setCheck(page, "reproducibility")).toHaveAttribute(
        "data-status",
        "not-run",
      );
      await expect(setCheck(page, "distribution-remoteness")).toHaveAttribute(
        "data-status",
        "not-run",
      );
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("/verify edge cases", () => {
  test("a filter that leaves one class puts its 100% target inside the interval", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto(
      "/verify?seed=7&count=300&mode=population&council=Port+Adelaide+Enfield&coords=0",
    );
    const ra = setCheck(page, "distribution-remoteness");
    await expect(ra).toHaveAttribute("data-status", "not-run", { timeout: 60_000 });
    await expect(ra).toContainText("Every target lies inside its 95% Wilson interval.");
    await expect(ra.locator("tbody tr")).toHaveCount(1);
    await expect(ra.locator("tbody tr td").last()).toHaveText("yes");
    expect(errors).toEqual([]);
  });

  test("a broken hand-off link explains itself", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/verify?seed=12&count=0");
    await expect(
      page.getByRole("alert").filter({ hasText: "The checks could not run" }),
    ).toContainText("The count must be a whole number");
    expect(errors).toEqual([]);
  });
});

test.describe("/verify live spot check", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("reverse-geocodes 10 points through /api/geocode, then waits a minute", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchConsole(page);
    const geocodeCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/geocode")) geocodeCalls.push(r.url());
    });
    await page.goto("/verify?seed=2025&count=200&mode=remoteness");
    await expect(page.locator('section[aria-label="Verification summary"]')).toBeVisible({
      timeout: 60_000,
    });
    expect(geocodeCalls).toEqual([]);
    await page.getByRole("switch", { name: "Turn on" }).click();
    const spot = page.getByTestId("spot-check");
    await expect(spot).toContainText("These addresses are synthetic");
    await spot.getByRole("button", { name: "Reverse-geocode 10 points" }).click();
    await expect(spot.locator("li[data-spot-state]")).toHaveCount(10);
    await expect(spot.locator('li[data-spot-state="waiting"]')).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(spot.locator('li[data-spot-state="asking"]')).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("spot-check-summary")).toContainText(
      /Suburb agrees for \d+ of \d+, postcode for \d+ of \d+/,
    );
    // finished, so not "so far"
    await expect(page.getByTestId("spot-check-summary")).toContainText(
      /\(\d+ of 10 points answered\)\./,
    );
    expect(geocodeCalls).toHaveLength(10);
    for (const url of geocodeCalls)
      expect(url).toMatch(/\/api\/geocode\?lat=-\d+\.\d+&lon=\d+\.\d+$/);
    // rate limited: one run a minute
    await expect(spot.getByRole("button", { name: /Reverse-geocode/ })).toBeDisabled();
    await expect(spot).toContainText(/Next run in \d+ s/);
    expect(errors).toEqual([]);
  });
});
