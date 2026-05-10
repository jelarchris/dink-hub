import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../support/auth";
import { E2E } from "../support/seed";

test.use({ storageState: STORAGE_STATE.player });

test("player sees their bookings page", async ({ page }) => {
  await page.goto("/me/bookings");
  await expect(page).toHaveURL(/\/me\/bookings$/);
  await expect(page.getByRole("heading", { name: /my bookings/i, level: 1 })).toBeVisible();
});

test("player can open the seeded venue's slot picker", async ({ page }) => {
  await page.goto(`/venues/${E2E.venue.slug}`);
  await expect(page.getByRole("heading", { name: E2E.venue.name })).toBeVisible();
  await expect(page.getByRole("heading", { name: /pick your time/i })).toBeVisible();
});
