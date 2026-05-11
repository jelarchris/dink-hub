import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "../support/auth";
import { createSubmittedOwnerInvoice, E2E } from "../support/seed";

test.use({ storageState: STORAGE_STATE.admin });

test.describe("admin owner invoice verification queue", () => {
  test.describe.configure({ timeout: 90_000 });

  test("admin verifies a submitted owner invoice and owner sees it paid", async ({
    browser,
    page,
  }) => {
    const invoice = await createSubmittedOwnerInvoice({
      label: "verify",
      periodOffsetWeeks: 0,
      feesCentavos: 4_000,
      bookingCount: 2,
    });

    await page.goto("/admin/invoices");
    await expect(
      page.getByRole("heading", { name: "DinkHub invoices", level: 1 }),
    ).toBeVisible();

    const invoiceLink = page.locator(`a[href="/admin/invoices/${invoice.id}"]`);
    await expect(invoiceLink).toBeVisible();
    await invoiceLink.click();

    await expect(page.getByRole("heading", { name: E2E.venue.name, level: 1 })).toBeVisible();
    await expect(page.getByText("Awaiting verification")).toBeVisible();
    await page.getByLabel(/notes/i).fill("E2E matched GCash transaction");
    await page.getByRole("button", { name: /verify & settle/i }).click();

    await expect(page.getByText(/No further actions available/)).toBeVisible();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    await expect(page.getByText("platform_cash")).toBeVisible();
    await expect(page.getByText("venue_payable")).toBeVisible();
    await expect(page.getByRole("button", { name: /verify & settle/i })).toHaveCount(0);

    const ownerContext = await browser.newContext({ storageState: STORAGE_STATE.owner });
    const ownerPage = await ownerContext.newPage();
    try {
      await ownerPage.goto(`/owner/invoices/${invoice.id}`);
      await expect(ownerPage.getByText("Invoice paid")).toBeVisible();
      await expect(ownerPage.getByText("Paid", { exact: true })).toBeVisible();
      await expect(ownerPage.getByText(/Upload your receipt/i)).toHaveCount(0);
    } finally {
      await ownerContext.close();
    }
  });

  test("admin rejects a submitted owner invoice and owner sees the reason", async ({
    browser,
    page,
  }) => {
    const invoice = await createSubmittedOwnerInvoice({
      label: "reject",
      periodOffsetWeeks: 1,
      feesCentavos: 6_000,
      bookingCount: 3,
    });
    const reason = "E2E receipt amount does not match the invoice total";

    await page.goto(`/admin/invoices/${invoice.id}`);
    await expect(page.getByRole("heading", { name: E2E.venue.name, level: 1 })).toBeVisible();
    await expect(page.getByText("Awaiting verification")).toBeVisible();
    await page.getByLabel(/reason for rejection/i).fill(reason);
    await page.getByRole("button", { name: /reject receipt/i }).click();

    await expect(page.getByText(/No further actions available/)).toBeVisible();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByRole("button", { name: /reject receipt/i })).toHaveCount(0);

    const ownerContext = await browser.newContext({ storageState: STORAGE_STATE.owner });
    const ownerPage = await ownerContext.newPage();
    try {
      await ownerPage.goto(`/owner/invoices/${invoice.id}`);
      await expect(ownerPage.getByText("Previous receipt rejected")).toBeVisible();
      await expect(ownerPage.getByText(reason)).toBeVisible();
      await expect(
        ownerPage.getByRole("heading", { name: "Upload your receipt" }),
      ).toBeVisible();
    } finally {
      await ownerContext.close();
    }
  });
});