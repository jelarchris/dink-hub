import { test, expect } from "@playwright/test";

/**
 * Smoke: anonymous routing. Validates the harness end-to-end: app builds,
 * dev server is up, public pages render, gated pages redirect to /sign-in.
 */
test.describe("smoke", () => {
  test("public pages render", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/dinkhub/i);

    await page.goto("/venues");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible();

    await page.goto("/sign-up");
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("gated routes redirect anonymous users to sign-in", async ({ page }) => {
    for (const target of ["/me/bookings", "/owner", "/admin"]) {
      await page.goto(target);
      await expect(page).toHaveURL(/\/sign-in(\?|$)/);
    }
  });
});
