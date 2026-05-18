import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, lte, sql, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { getCurrentBookingFeeRule } from "@/features/system-settings";
import {
  bookings,
  courtClosures,
  courtHourlyRates,
  courts,
  ledgerEntries,
  payments,
  slotHolds,
  systemFeeSettings,
  venues,
  type Booking,
  type Court,
  type CourtHourlyRate,
  type NewBooking,
  type NewLedgerEntry,
  type NewPayment,
  type NewSlotHold,
  type Payment,
  type SlotHold,
  type Venue,
} from "@/db/schema";

/**
 * Repository layer. Pure data access — NO business logic, NO authorization.
 * All queries here run with the connection pool's role (postgres) which
 * bypasses RLS. Authorization MUST be enforced in the service layer.
 *
 * Functions accept an optional `tx` so callers can compose them inside a
 * transaction (e.g., createBooking + consume hold atomically).
 */

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

/**
 * Returns true if any active (non-deleted) closure for the given court
 * overlaps the [startAt, endAt) window. Interval overlap: closure.startAt < endAt && closure.endAt > startAt.
 * Called by booking and reschedule flows to block creation during scheduled closures.
 */
export async function hasActiveClosureInRange(
  args: { courtId: string; startAt: Date; endAt: Date },
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec
    .select({ id: courtClosures.id })
    .from(courtClosures)
    .where(
      and(
        eq(courtClosures.courtId, args.courtId),
        isNull(courtClosures.deletedAt),
        lt(courtClosures.startAt, args.endAt),
        gt(courtClosures.endAt, args.startAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findCourtRateBands(
  courtId: string,
  exec: Executor = db,
): Promise<CourtHourlyRate[]> {
  return exec
    .select()
    .from(courtHourlyRates)
    .where(eq(courtHourlyRates.courtId, courtId))
    .orderBy(courtHourlyRates.fromHour);
}

export async function findCourtById(
  courtId: string,
  exec: Executor = db,
): Promise<{ court: Court; venue: Venue } | null> {
  const rows = await exec
    .select({ court: courts, venue: venues })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(eq(courts.id, courtId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findBookingById(
  bookingId: string,
  exec: Executor = db,
): Promise<Booking | null> {
  const rows = await exec.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return rows[0] ?? null;
}

export async function findHoldById(
  holdId: string,
  exec: Executor = db,
): Promise<SlotHold | null> {
  const rows = await exec.select().from(slotHolds).where(eq(slotHolds.id, holdId)).limit(1);
  return rows[0] ?? null;
}

export async function findPaymentById(
  paymentId: string,
  exec: Executor = db,
): Promise<Payment | null> {
  const rows = await exec.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Current snapshot value of the platform booking fee — what the player should
 * see as the estimated fee on the booking page and what gets written onto
 * `bookings.system_fee_centavos` at creation time.
 *
 * Source of truth is `system_settings` (the singleton edited by admin →
 * `getCurrentBookingFeeRule`). The legacy `system_fee_settings` history
 * table is read-only fallback for envs/tests where the singleton hasn't been
 * seeded.
 *
 * Returns null only when neither source has a value (unreachable in prod).
 */
export async function findCurrentSystemFeeCentavos(exec: Executor = db): Promise<bigint | null> {
  try {
    const rule = await getCurrentBookingFeeRule();
    return rule.snapshotCentavos;
  } catch {
    // Singleton not seeded — fall back to legacy history table.
    const rows = await exec
      .select({ fee: systemFeeSettings.feeAmountCentavos })
      .from(systemFeeSettings)
      .where(lte(systemFeeSettings.effectiveFrom, sql`now()`))
      .orderBy(desc(systemFeeSettings.effectiveFrom))
      .limit(1);
    return rows[0]?.fee ?? null;
  }
}

export async function getDatabaseNow(exec: Executor = db): Promise<Date> {
  const rows = await exec.execute<{ now: Date }>(sql`select now() as now`);
  const row = rows[0];
  if (!row) throw new Error("getDatabaseNow: no row returned");
  return new Date(row.now);
}

// ----------------------------------------------------------------------------
// Writes
// ----------------------------------------------------------------------------

export async function insertSlotHold(
  values: NewSlotHold,
  exec: Executor = db,
): Promise<SlotHold> {
  const rows = await exec.insert(slotHolds).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertSlotHold: no row returned");
  return inserted;
}

export async function deleteHoldById(
  holdId: string,
  exec: Executor = db,
): Promise<number> {
  const rows = await exec.delete(slotHolds).where(eq(slotHolds.id, holdId)).returning({
    id: slotHolds.id,
  });
  return rows.length;
}

export async function deleteExpiredHolds(exec: Executor = db): Promise<number> {
  const rows = await exec
    .delete(slotHolds)
    .where(lt(slotHolds.expiresAt, sql`now()`))
    .returning({ id: slotHolds.id });
  return rows.length;
}

export async function insertBooking(
  values: NewBooking,
  exec: Executor = db,
): Promise<Booking> {
  const rows = await exec.insert(bookings).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertBooking: no row returned");
  return inserted;
}

/**
 * Optimistic update: only succeeds when the row's `version` matches `expectedVersion`.
 * Returns the updated row, or null if version mismatch / row missing.
 */
export async function updateBookingStatus(
  bookingId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<
      Booking,
      | "status"
      | "notes"
      | "cancelledAt"
      | "cancelledBy"
      | "cancellationReason"
      | "cancellationCategory"
    >
  >,
  exec: Executor = db,
): Promise<Booking | null> {
  const rows = await exec
    .update(bookings)
    .set(patch)
    .where(and(eq(bookings.id, bookingId), eq(bookings.version, expectedVersion)))
    .returning();
  return rows[0] ?? null;
}

export async function insertPayment(
  values: NewPayment,
  exec: Executor = db,
): Promise<Payment> {
  const rows = await exec.insert(payments).values(values).returning();
  const inserted = rows[0];
  if (!inserted) throw new Error("insertPayment: no row returned");
  return inserted;
}

export async function updatePayment(
  paymentId: string,
  expectedVersion: number,
  patch: Partial<Pick<Payment, "status" | "verifiedBy" | "verifiedAt" | "rejectionReason">>,
  exec: Executor = db,
): Promise<Payment | null> {
  const rows = await exec
    .update(payments)
    .set(patch)
    .where(and(eq(payments.id, paymentId), eq(payments.version, expectedVersion)))
    .returning();
  return rows[0] ?? null;
}

export async function insertLedgerEntries(
  entries: NewLedgerEntry[],
  exec: Executor = db,
): Promise<void> {
  if (entries.length === 0) return;
  await exec.insert(ledgerEntries).values(entries);
}

/**
 * Find pending_payment bookings whose payment_due_at has passed.
 * Used by the cron expiry job.
 */
export async function findExpiredPendingBookings(
  limit = 100,
  exec: Executor = db,
): Promise<Pick<Booking, "id" | "version">[]> {
  return exec
    .select({ id: bookings.id, version: bookings.version })
    .from(bookings)
    .where(and(eq(bookings.status, "pending_payment"), lt(bookings.paymentDueAt, sql`now()`)))
    .limit(limit);
}

/**
 * Expire any pending_payment bookings on `courtId` whose 15-min payment
 * window has lapsed AND whose time range overlaps [startAt, endAt].
 *
 * Called inline from `createBooking` (in the same tx) so the EXCLUDE
 * constraint doesn't reject a new booking just because the previous
 * player let their window lapse seconds ago and the every-minute cron
 * hasn't run yet. Returns the number of rows flipped.
 *
 * Court-scoped + time-scoped so we never touch unrelated rows.
 */
export async function expireOverlappingStalePendingBookings(
  args: { courtId: string; startAt: Date; endAt: Date },
  exec: Executor = db,
): Promise<number> {
  const rows = await exec
    .update(bookings)
    .set({ status: "expired" })
    .where(
      and(
        eq(bookings.courtId, args.courtId),
        eq(bookings.status, "pending_payment"),
        lte(bookings.paymentDueAt, sql`now()`),
        lt(bookings.startAt, args.endAt),
        gt(bookings.endAt, args.startAt),
      ),
    )
    .returning({ id: bookings.id });
  return rows.length;
}

/**
 * Returns confirmed bookings whose session starts in [windowStart, windowEnd]
 * and that haven't had a reminder sent yet. The caller constrains the window
 * to ~30 min around the T-2h mark so each cron run covers exactly one firing
 * per booking. `reminder_sent_at IS NULL` is the idempotency guard.
 */
export async function findBookingsNeedingReminder(
  windowStart: Date,
  windowEnd: Date,
  limit = 200,
  exec: Executor = db,
): Promise<Pick<Booking, "id">[]> {
  return exec
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminderSentAt),
        gte(bookings.startAt, windowStart),
        lt(bookings.startAt, windowEnd),
      ),
    )
    .limit(limit);
}

/**
 * Stamps reminder_sent_at = now() on a single booking. Fire-and-forget safe:
 * a second call is a no-op because the cron skips rows where it's already set.
 */
export async function markReminderSent(
  bookingId: string,
  exec: Executor = db,
): Promise<void> {
  await exec
    .update(bookings)
    .set({ reminderSentAt: sql`now()` })
    .where(eq(bookings.id, bookingId));
}

/**
 * Returns the active hold for (court, range) if any. Used to check a client-supplied
 * holdId actually still covers the slot they're booking.
 */
export async function findHoldForSlot(
  args: { courtId: string; startAt: Date; endAt: Date },
  exec: Executor = db,
): Promise<SlotHold | null> {
  const rows = await exec
    .select()
    .from(slotHolds)
    .where(
      and(
        eq(slotHolds.courtId, args.courtId),
        eq(slotHolds.startAt, args.startAt),
        eq(slotHolds.endAt, args.endAt),
        gt(slotHolds.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns all active (non-terminal) bookings for the given venue courts that
 * overlap the [fromAt, untilAt) window. Uses standard interval-overlap logic:
 *   booking.startAt < untilAt  AND  booking.endAt > fromAt
 *
 * Used by the bulk-closure service to preview and cancel affected bookings.
 */
export async function findCancellableBookingsInRange(
  args: {
    courtIds: string[];
    fromAt: Date;
    untilAt: Date;
  },
  exec: Executor = db,
): Promise<Pick<Booking, "id" | "version" | "courtId" | "startAt" | "endAt" | "totalCentavos" | "status">[]> {
  if (args.courtIds.length === 0) return [];
  const CANCELLABLE = ["pending_payment", "payment_submitted", "confirmed"] as const;
  return exec
    .select({
      id: bookings.id,
      version: bookings.version,
      courtId: bookings.courtId,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      totalCentavos: bookings.totalCentavos,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.courtId, args.courtIds),
        inArray(bookings.status, CANCELLABLE),
        lt(bookings.startAt, args.untilAt),
        gt(bookings.endAt, args.fromAt),
      ),
    )
    .orderBy(bookings.startAt);
}
