/**
 * Checks that the Verification Lab card appears on the landing page and that
 * the link works at both desktop and mobile viewports.
 */
import { test, expect } from "@playwright/test";

test.describe("Landing page Verification Lab card", () => {
  test("should display the Verification Lab card and link at 1440px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // Check no console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Find the Verification Lab card
    const card = page.getByRole("link", { name: /Verification Lab/i });
    await expect(card).toBeVisible();

    // Check the card has the correct href
    await expect(card).toHaveAttribute("href", "/verify");

    // Check the card body text is present
    await expect(
      page.getByText(
        /Every address checked inside its own suburb against ABS boundaries/i,
      ),
    ).toBeVisible();

    // Click the link and verify navigation
    await card.click();
    await expect(page).toHaveURL("/verify");

    // Verify no console errors
    expect(errors).toEqual([]);
  });

  test("should display the Verification Lab card and link at 390px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Check no console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Find the Verification Lab card
    const card = page.getByRole("link", { name: /Verification Lab/i });
    await expect(card).toBeVisible();

    // Check the card has the correct href
    await expect(card).toHaveAttribute("href", "/verify");

    // Check the card body text is present
    await expect(
      page.getByText(
        /Every address checked inside its own suburb against ABS boundaries/i,
      ),
    ).toBeVisible();

    // Click the link and verify navigation
    await card.click();
    await expect(page).toHaveURL("/verify");

    // Verify no console errors
    expect(errors).toEqual([]);
  });

  test("should not have horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Check that document width doesn't exceed viewport
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
