import { test, expect } from "@playwright/test";
import { E2E } from "../support/seed";

/**
 * Public surface: the seeded venue is listed on /venues and its detail page
 * renders the slot picker. End-to-end validation that seedWorld() actually
 * lands real rows the app can render.
 */
test.describe("public catalog", () => {
  test("seeded venue appears on /venues", async ({ page }) => {
    await page.goto("/venues");
    await expect(page.getByText(E2E.venue.name).first()).toBeVisible();
  });

  test("venue detail page renders slot picker", async ({ page }) => {
    await page.goto(`/venues/${E2E.venue.slug}`);
    await expect(
      page.getByRole("heading", { name: E2E.venue.name }),
    ).toBeVisible();
    // Slot grid renders one form per start time.
    const slotForms = page.locator('form button[type="submit"]');
    await expect(slotForms.first()).toBeVisible({ timeout: 10_000 });
  });
});
