import { test, expect } from "@playwright/test";
import { MOCK_STAMP } from "../src/lib/suburbs";

const SAMPLE_CSV = `id,stamp,full_address,street_address,street_number,street_name,suburb,postcode,council,remoteness_level,seifa_decile_sa,latitude,longitude,sal_code
1,${MOCK_STAMP},"123 King Street, ADELAIDE SA 5000",123 King Street,123,King Street,ADELAIDE,5000,Adelaide,Major Cities of Australia,5,-34.9255,138.5999,40001
2,${MOCK_STAMP},"456 Queen Street, GLENELG SA 5045",456 Queen Street,456,Queen Street,GLENELG,5045,Holdfast Bay,Major Cities of Australia,6,-34.9790,138.5130,40250`;

for (const viewport of [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
]) {
  test.describe(`verify page at ${viewport.label} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport });

    test("loads without errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto("/verify");
      await expect(page.locator("h1")).toContainText("Verify");

      expect(errors).toEqual([]);
    });

    test("can paste CSV and see results", async ({ page }) => {
      await page.goto("/verify");

      // Fill CSV textarea
      const textarea = page.locator('textarea[id$="-csv"]');
      await textarea.fill(SAMPLE_CSV);

      // Click verify button
      const verifyButton = page.locator('button[type="submit"]', { hasText: /Verify CSV/i });
      await verifyButton.click();

      // Wait for results
      await expect(page.locator('text=Record-Level Checks')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Set-Level Checks')).toBeVisible();

      // Check for check results - look for the summary box
      const summary = page.locator('section[aria-label="Verification summary"]');
      await expect(summary).toBeVisible();
    });

    test("no layout overflow", async ({ page }) => {
      await page.goto("/verify");

      const body = page.locator("body");
      const box = await body.boundingBox();

      if (box) {
        // Check no horizontal scroll
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding
      }
    });

    test("download buttons work", async ({ page }) => {
      await page.goto("/verify");

      const textarea = page.locator('textarea[id$="-csv"]');
      await textarea.fill(SAMPLE_CSV);

      const verifyButton = page.locator('button[type="submit"]', { hasText: /Verify CSV/i });
      await verifyButton.click();

      await expect(page.locator('text=Record-Level Checks')).toBeVisible({ timeout: 10000 });

      // Check download buttons exist
      const markdownButton = page.locator('button', { hasText: /Markdown/i });
      const jsonButton = page.locator('button', { hasText: /JSON/i });

      await expect(markdownButton).toBeVisible();
      await expect(jsonButton).toBeVisible();
    });
  });
}
