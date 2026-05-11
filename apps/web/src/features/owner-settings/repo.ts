import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bookings, courts, payments, profiles, venues } from "@/db/schema";
import type { NotificationPrefs } from "./types";

export async function getNotificationPrefs(
  ownerId: string,
): Promise<NotificationPrefs | null> {
  const [row] = await db
    .select({ notificationPrefs: profiles.notificationPrefs })
    .from(profiles)
    .where(eq(profiles.id, ownerId))
    .limit(1);
  return row?.notificationPrefs ?? null;
}

export async function updateNotificationPrefs(
  ownerId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  await db
    .update(profiles)
    .set({ notificationPrefs: prefs, updatedAt: new Date() })
    .where(eq(profiles.id, ownerId));
}

export interface DigestOwner {
  ownerId: string;
  email: string;
  displayName: string;
}

/**
 * Returns all venue owners who have opted into the daily digest email and have
 * at least one non-deleted venue. Distinct on profile ID to avoid duplicates
 * when an owner has multiple venues.
 */
export async function getDigestOwners(): Promise<DigestOwner[]> {
  const rows = await db
    .selectDistinctOn([profiles.id], {
      ownerId: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .innerJoin(
      venues,
      and(eq(venues.ownerId, profiles.id), isNull(venues.deletedAt)),
    )
    .where(
      and(
        // jsonb path operator: check the boolean flag without pulling the full object
        sql`${profiles.notificationPrefs}->>'email_daily_digest' = 'true'`,
        isNull(profiles.deletedAt),
      ),
    );
  return rows;
}

export interface DigestStats {
  newBookingsToday: number;
  pendingReceiptsCount: number;
  todayRevenueCentavos: bigint;
}

/**
 * Loads per-owner digest statistics for the given UTC day window.
 * Two queries: new bookings created today + pending receipts awaiting review.
 */
export async function getDigestStatsForOwner(
  ownerId: string,
  dayStartUtc: Date,
  dayEndUtc: Date,
): Promise<DigestStats> {
  const newBookingRows = await db
    .select({
      totalCentavos: bookings.totalCentavos,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(
      venues,
      and(eq(venues.id, courts.venueId), eq(venues.ownerId, ownerId)),
    )
    .where(
      and(
        gte(bookings.createdAt, dayStartUtc),
        lt(bookings.createdAt, dayEndUtc),
      ),
    );

  const pendingRows = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(
      venues,
      and(eq(venues.id, courts.venueId), eq(venues.ownerId, ownerId)),
    )
    .where(eq(payments.status, "submitted"));

  const todayRevenueCentavos = newBookingRows.reduce(
    (acc, r) => (r.status === "confirmed" ? acc + r.totalCentavos : acc),
    0n,
  );

  return {
    newBookingsToday: newBookingRows.length,
    pendingReceiptsCount: pendingRows.length,
    todayRevenueCentavos,
  };
}
