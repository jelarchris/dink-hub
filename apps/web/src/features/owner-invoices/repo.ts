import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  ownerInvoices,
  venues,
  type NewOwnerInvoice,
  type OwnerInvoice,
  type Venue,
} from "@/db/schema";

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
