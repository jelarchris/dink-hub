import "server-only";
import { getSystemSettings } from "@/features/system-settings";
import { db } from "@/db/client";
import type { OwnerInvoice } from "@/db/schema";
import {
  aggregateBookingFeesForPeriod,
  applyReceiptToInvoice,
  findInvoiceForOwner,
  upsertOpenInvoice,
} from "./repo";
import { OwnerInvoiceError } from "./errors";
import {
  submitInvoicePaymentInputSchema,
  type SubmitInvoicePaymentInput,
} from "./schema";

export {
  findOutstandingInvoiceForOwner,
  listInvoicesForOwner,
  findInvoiceForOwner,
} from "./repo";
export { OwnerInvoiceError, isOwnerInvoiceError } from "./errors";
export { submitInvoicePaymentInputSchema, type SubmitInvoicePaymentInput } from "./schema";

/** Minimum invoice value (₱100). Anything below rolls forward via carryover. */
const MIN_INVOICE_CENTAVOS = 10_000n;

/**
 * Compute the prior week period (Mon 00:00 → next Mon 00:00, Asia/Manila wall-clock)
 * relative to `now` (UTC). Used by the Monday-morning Manila cron.
 *
 * Manila is UTC+8 fixed (no DST), so we shift `now` by +8h to get Manila wall-clock,
 * floor to the most recent Monday 00:00, then shift back to UTC.
 */
export function computePriorWeekPeriod(now: Date): { periodStart: Date; periodEnd: Date } {
  const MS_PER_HOUR = 3_600_000;
  const MS_PER_DAY = 86_400_000;
  const MANILA_OFFSET_MS = 8 * MS_PER_HOUR;

  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  // getUTCDay on the shifted date returns the Manila-wall-clock day of week.
  const dayOfWeek = manilaNow.getUTCDay(); // 0 = Sun
  // Days back to the most recent Monday (1).
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon→0, Sun→6
  const manilaThisMondayMidnight = Date.UTC(
    manilaNow.getUTCFullYear(),
    manilaNow.getUTCMonth(),
    manilaNow.getUTCDate() - daysSinceMonday,
  );
  const manilaPriorMondayMidnight = manilaThisMondayMidnight - 7 * MS_PER_DAY;

  const periodStart = new Date(manilaPriorMondayMidnight - MANILA_OFFSET_MS);
  const periodEnd = new Date(manilaThisMondayMidnight - MANILA_OFFSET_MS);
  return { periodStart, periodEnd };
}

/** Format a Date to YYYY-MM-DD (date column accepts ISO date string). */
function toDateString(d: Date): string {
  const iso = d.toISOString();
  const date = iso.slice(0, 10);
  if (!date) throw new Error("toDateString: empty");
  return date;
}

export interface GenerateWeeklyInvoicesResult {
  periodStart: string;
  periodEnd: string;
  candidateVenues: number;
  invoicesCreated: number;
  invoicesSkippedExisting: number;
  invoicesSkippedZeroFees: number;
  invoicesSkippedBelowMin: number;
  /** IDs of invoices created in this run — used by the cron to send issued emails. */
  createdInvoiceIds: string[];
}

/**
 * Generate one invoice per venue with non-zero fees in the given period.
 *
 * Idempotent: a re-run for the same period is a no-op (UNIQUE constraint).
 * Below-minimum invoices are skipped — the unbilled amount stays embedded in
 * the source bookings and will be picked up next week (carryover handling
 * lives in a future iteration; for now we simply defer until the threshold
 * is met).
 */
export async function generateWeeklyInvoices(args: {
  periodStart: Date;
  periodEnd: Date;
}): Promise<GenerateWeeklyInvoicesResult> {
  const settings = await getSystemSettings();
  const aggregates = await aggregateBookingFeesForPeriod(args);
  const dueDate = new Date(args.periodEnd.getTime() + settings.invoiceDueDays * 86_400_000);

  let invoicesCreated = 0;
  let invoicesSkippedExisting = 0;
  let invoicesSkippedZeroFees = 0;
  let invoicesSkippedBelowMin = 0;
  const createdInvoiceIds: string[] = [];

  for (const row of aggregates) {
    if (row.feesCentavos <= 0n) {
      invoicesSkippedZeroFees += 1;
      continue;
    }
    if (row.feesCentavos < MIN_INVOICE_CENTAVOS) {
      invoicesSkippedBelowMin += 1;
      continue;
    }
    const { inserted, invoice } = await upsertOpenInvoice({
      venueId: row.venueId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      bookingCount: row.bookingCount,
      feesCentavos: row.feesCentavos,
      carryoverCentavos: 0n,
      dueDate: toDateString(dueDate),
      status: "open",
    });
    if (inserted) {
      invoicesCreated += 1;
      createdInvoiceIds.push(invoice.id);
    } else {
      invoicesSkippedExisting += 1;
    }
  }

  const result: GenerateWeeklyInvoicesResult = {
    periodStart: args.periodStart.toISOString(),
    periodEnd: args.periodEnd.toISOString(),
    candidateVenues: aggregates.length,
    invoicesCreated,
    invoicesSkippedExisting,
    invoicesSkippedZeroFees,
    invoicesSkippedBelowMin,
    createdInvoiceIds,
  };
  return result;
}

// ============================================================================
// Owner pays an invoice — uploads GCash receipt
// ============================================================================

export interface SubmitInvoicePaymentArgs extends SubmitInvoicePaymentInput {
  /** Authenticated owner submitting the payment. Re-validated server-side. */
  ownerId: string;
}

/**
 * Atomically attach a receipt to an invoice and flip it to `submitted`.
 *
 * Authorisation, status, amount, and concurrency are all re-checked here even
 * though the action layer also checks them — defence in depth so the service
 * can never produce a corrupt state regardless of how it is called.
 */
export async function submitInvoicePayment(args: SubmitInvoicePaymentArgs): Promise<OwnerInvoice> {
  const parsed = submitInvoicePaymentInputSchema.safeParse({
    invoiceId: args.invoiceId,
    receiptImagePath: args.receiptImagePath,
    receiptHash: args.receiptHash,
    amountPaidCentavos: args.amountPaidCentavos,
    ...(args.gcashReferenceNumber !== undefined && {
      gcashReferenceNumber: args.gcashReferenceNumber,
    }),
  });
  if (!parsed.success) {
    throw new OwnerInvoiceError("validation_failed", "Invalid receipt submission", {
      issues: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  return db.transaction(async (tx) => {
    const detail = await findInvoiceForOwner(input.invoiceId, args.ownerId, tx);
    if (!detail) {
      throw new OwnerInvoiceError("invoice_not_found", "Invoice not found");
    }
    const { invoice } = detail;
    if (invoice.status !== "open" && invoice.status !== "rejected") {
      throw new OwnerInvoiceError(
        "invoice_wrong_status",
        `Cannot submit — invoice status is ${invoice.status.replace("_", " ")}`,
      );
    }
    if (input.amountPaidCentavos !== invoice.totalCentavos) {
      throw new OwnerInvoiceError(
        "amount_mismatch",
        "Receipt amount does not match invoice total",
        {
          expected: invoice.totalCentavos.toString(),
          received: input.amountPaidCentavos.toString(),
        },
      );
    }

    const updated = await applyReceiptToInvoice(
      {
        invoiceId: invoice.id,
        expectedVersion: invoice.version,
        receiptImagePath: input.receiptImagePath,
        receiptHash: input.receiptHash,
        amountPaidCentavos: input.amountPaidCentavos,
        gcashReferenceNumber: input.gcashReferenceNumber ?? null,
        submittedBy: args.ownerId,
      },
      tx,
    );
    if (!updated) {
      throw new OwnerInvoiceError(
        "concurrent_modification",
        "Invoice was modified by someone else — refresh and try again",
      );
    }
    return updated;
  });
}
