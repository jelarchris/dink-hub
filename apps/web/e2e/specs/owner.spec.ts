import { test, expect } from "@playwright/test";
import { STORAGE_STATE } from "../support/auth";
import { E2E } from "../support/seed";

test.use({ storageState: STORAGE_STATE.owner });

test("owner dashboard greets the seeded owner", async ({ page }) => {
  await page.goto("/owner");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(E2E.owner.displayName);
});

test("owner sees their venue listed", async ({ page }) => {
  await page.goto("/owner/venues");
  await expect(page.getByRole("heading", { name: /your venues/i, level: 1 })).toBeVisible();
  await expect(page.getByText(E2E.venue.name)).toBeVisible();
});
