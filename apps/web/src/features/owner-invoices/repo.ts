import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  ownerInvoices,
  venues,
  type NewOwnerInvoice,
  type OwnerInvoice,
  type Venue,
} from "@/db/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Aggregate one row per venue: number of confirmed bookings whose START falls
 * inside [periodStart, periodEnd) and the sum of their snapshotted system fees.
 *
 * Confirmed-only — pending/cancelled/expired bookings never owe a fee.
 */
export interface PeriodAggregateRow {
  venueId: string;
  bookingCount: number;
  feesCentavos: bigint;
}

export async function aggregateBookingFeesForPeriod(args: {
  periodStart: Date;
  periodEnd: Date;
}): Promise<PeriodAggregateRow[]> {
  const rows = await db
    .select({
      venueId: bookings.venueId,
      bookingCount: sql<number>`count(*)::int`,
      feesCentavos: sql<bigint>`coalesce(sum(${bookings.systemFeeCentavos}), 0)::bigint`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        sql`${bookings.startAt} >= ${args.periodStart}`,
        sql`${bookings.startAt} <  ${args.periodEnd}`,
      ),
    )
    .groupBy(bookings.venueId);

  return rows.map((r) => ({
    venueId: r.venueId,
    bookingCount: Number(r.bookingCount),
    feesCentavos: BigInt(r.feesCentavos as unknown as string | number | bigint),
  }));
}

/**
 * Compute the unbilled carryover for a single venue as of a given period start.
 *
 * Carryover = (all confirmed booking fees for the venue whose startAt < periodStart)
 *           − (fees_centavos already billed in any non-void invoice for the venue)
 *
 * A negative result (over-billed edge case) is clamped to 0n.
 * This is called per-venue during weekly invoice generation so each query hits
 * a small row count; no full-table scan.
 */
export async function getCarryoverForVenue(args: {
  venueId: string;
  periodStart: Date;
}): Promise<bigint> {
  const [totalFees, alreadyBilled] = await Promise.all([
    db
      .select({
        total: sql<string>`coalesce(sum(${bookings.systemFeeCentavos}), 0)`.mapWith(String),
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.venueId, args.venueId),
          eq(bookings.status, "confirmed"),
          sql`${bookings.startAt} < ${args.periodStart}`,
        ),
      ),
    db
      .select({
        billed: sql<string>`coalesce(sum(${ownerInvoices.feesCentavos}), 0)`.mapWith(String),
      })
      .from(ownerInvoices)
      .where(
        and(
          eq(ownerInvoices.venueId, args.venueId),
          ne(ownerInvoices.status, "void"),
        ),
      ),
  ]);

  const total = BigInt(totalFees[0]?.total ?? "0");
  const billed = BigInt(alreadyBilled[0]?.billed ?? "0");
  return total > billed ? total - billed : 0n;
}

/**
 * Idempotent insert. Relies on the UNIQUE (venue_id, period_start) constraint
 * so a re-run of the cron during the same week is a no-op.
 *
 * Returns the row that was inserted, OR the existing row if a conflict occurred.
 */
export async function upsertOpenInvoice(
  row: NewOwnerInvoice,
): Promise<{ inserted: boolean; invoice: OwnerInvoice }> {
  const inserted = await db
    .insert(ownerInvoices)
    .values(row)
    .onConflictDoNothing({ target: [ownerInvoices.venueId, ownerInvoices.periodStart] })
    .returning();

  const first = inserted[0];
  if (first) return { inserted: true, invoice: first };

  const existing = await db
    .select()
    .from(ownerInvoices)
    .where(
      and(
        eq(ownerInvoices.venueId, row.venueId),
        eq(ownerInvoices.periodStart, row.periodStart as Date),
      ),
    )
    .limit(1);

  const existingRow = existing[0];
  if (!existingRow) {
    throw new Error("upsertOpenInvoice: insert skipped but no existing row found");
  }
  return { inserted: false, invoice: existingRow };
}

/** Most recent open OR submitted invoice across all venues this owner controls. */
export async function findOutstandingInvoiceForOwner(
  ownerId: string,
): Promise<{ invoice: OwnerInvoice; venue: Venue } | null> {
  const rows = await db
    .select({ invoice: ownerInvoices, venue: venues })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .where(
      and(
        eq(venues.ownerId, ownerId),
        sql`${ownerInvoices.status} in ('open','submitted','rejected')`,
        sql`${venues.deletedAt} is null`,
      ),
    )
    .orderBy(sql`${ownerInvoices.dueDate} asc`)
    .limit(1);

  return rows[0] ?? null;
}

export async function listInvoicesForOwner(
  ownerId: string,
): Promise<Array<{ invoice: OwnerInvoice; venue: Venue }>> {
  return db
    .select({ invoice: ownerInvoices, venue: venues })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .where(and(eq(venues.ownerId, ownerId), sql`${venues.deletedAt} is null`))
    .orderBy(sql`${ownerInvoices.periodStart} desc`);
}

/**
 * Look up a single invoice + its venue, scoped to the requesting owner.
 *
 * Returns `null` for both "not found" and "not yours" so the caller cannot
 * distinguish — prevents id-enumeration disclosure.
 */
export async function findInvoiceForOwner(
  invoiceId: string,
  ownerId: string,
  exec: Executor = db,
): Promise<{ invoice: OwnerInvoice; venue: Venue } | null> {
  const rows = await exec
    .select({ invoice: ownerInvoices, venue: venues })
    .from(ownerInvoices)
    .innerJoin(venues, eq(venues.id, ownerInvoices.venueId))
    .where(
      and(
        eq(ownerInvoices.id, invoiceId),
        eq(venues.ownerId, ownerId),
        sql`${venues.deletedAt} is null`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Atomically attach receipt details and flip an invoice from open|rejected → submitted.
 *
 * Optimistic concurrency via `version` — a parallel submit (or admin verify)
 * will lose the race and the caller must surface `concurrent_modification`.
 *
 * The accepted prior statuses (`open`, `rejected`) are also enforced in the
 * WHERE clause as defence-in-depth: even if the application checks the status
 * before calling this, a race against admin verification cannot slip through.
 */
export interface ApplyReceiptToInvoiceInput {
  invoiceId: string;
  expectedVersion: number;
  receiptImagePath: string;
  receiptHash: string;
  amountPaidCentavos: bigint;
  gcashReferenceNumber: string | null;
  submittedBy: string;
}

export async function applyReceiptToInvoice(
  input: ApplyReceiptToInvoiceInput,
  exec: Executor = db,
): Promise<OwnerInvoice | null> {
  const rows = await exec
    .update(ownerInvoices)
    .set({
      status: "submitted",
      receiptImagePath: input.receiptImagePath,
      receiptHash: input.receiptHash,
      amountPaidCentavos: input.amountPaidCentavos,
      gcashReferenceNumber: input.gcashReferenceNumber,
      submittedAt: new Date(),
      submittedBy: input.submittedBy,
      // Re-submission after rejection: clear the old rejection so the UI
      // doesn't keep showing it once the owner has acted on it.
      rejectionReason: null,
      verifiedAt: null,
      verifiedBy: null,
      version: input.expectedVersion + 1,
    })
    .where(
      and(
        eq(ownerInvoices.id, input.invoiceId),
        eq(ownerInvoices.version, input.expectedVersion),
        sql`${ownerInvoices.status} in ('open','rejected')`,
      ),
    )
    .returning();

  return rows[0] ?? null;
}
