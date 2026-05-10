import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../support/auth";

test.use({ storageState: STORAGE_STATE.admin });

test("admin dashboard renders for admin role", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /admin dashboard/i, level: 1 })).toBeVisible();
});

test("admin can open the bookings list", async ({ page }) => {
  await page.goto("/admin/bookings");
  await expect(page.getByRole("heading", { name: /^bookings$/i, level: 1 })).toBeVisible();
});
