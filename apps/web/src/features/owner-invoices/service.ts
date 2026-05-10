import "server-only";
import { getSystemSettings } from "@/features/system-settings";
import { aggregateBookingFeesForPeriod, upsertOpenInvoice } from "./repo";

export {
  findOutstandingInvoiceForOwner,
  listInvoicesForOwner,
} from "./repo";

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

  for (const row of aggregates) {
    if (row.feesCentavos <= 0n) {
      invoicesSkippedZeroFees += 1;
      continue;
    }
    if (row.feesCentavos < MIN_INVOICE_CENTAVOS) {
      invoicesSkippedBelowMin += 1;
      continue;
    }
    const { inserted } = await upsertOpenInvoice({
      venueId: row.venueId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      bookingCount: row.bookingCount,
      feesCentavos: row.feesCentavos,
      carryoverCentavos: 0n,
      dueDate: toDateString(dueDate),
      status: "open",
    });
    if (inserted) invoicesCreated += 1;
    else invoicesSkippedExisting += 1;
  }

  const result: GenerateWeeklyInvoicesResult = {
    periodStart: args.periodStart.toISOString(),
    periodEnd: args.periodEnd.toISOString(),
    candidateVenues: aggregates.length,
    invoicesCreated,
    invoicesSkippedExisting,
    invoicesSkippedZeroFees,
    invoicesSkippedBelowMin,
  };
  return result;
}
