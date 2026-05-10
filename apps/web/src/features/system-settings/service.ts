import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { systemSettings, type SystemSettings } from "@/db/schema";

/**
 * Read the singleton platform settings row.
 *
 * Wrapped in React.cache so multiple Server Components in the same request
 * (banner + page + booking flow) share a single DB round-trip.
 */
export const getSystemSettings = cache(async (): Promise<SystemSettings> => {
  const rows = await db.select().from(systemSettings).limit(1);
  const row = rows[0];
  if (!row) {
    // Migration 0007 seeds the singleton; if missing, fail loudly.
    throw new Error("system_settings row missing — apply migration 0007");
  }
  return row;
});

export interface PromoState {
  active: boolean;
  headline: string;
  description: string;
  untilDate: string | null; // YYYY-MM-DD
  showOnHome: boolean;
  showOnBooking: boolean;
}

/**
 * Derived promo state. `active` is the source-of-truth flag; the optional
 * `promo_until_date` is shown to users but does NOT auto-disable — admins
 * flip the toggle when promo ends. (Auto-expiry is intentionally avoided
 * so admins can extend without a deploy.)
 */
export async function getPromoState(): Promise<PromoState> {
  const s = await getSystemSettings();
  return {
    active: s.promoActive,
    headline: s.promoHeadline,
    description: s.promoDescription,
    untilDate: s.promoUntilDate ?? null,
    showOnHome: s.promoShowOnHome,
    showOnBooking: s.promoShowOnBooking,
  };
}

export interface BookingFeeRule {
  /** What to snapshot to the booking row right now. */
  snapshotCentavos: bigint;
  /** What the displayed "base" fee is (used in non-promo callouts). */
  baseCentavos: bigint;
  /** True when the snapshotted fee is 0 because of an active promo. */
  promoApplied: boolean;
}

export async function getCurrentBookingFeeRule(): Promise<BookingFeeRule> {
  const s = await getSystemSettings();
  return {
    snapshotCentavos: s.promoActive ? 0n : s.baseBookingFeeCentavos,
    baseCentavos: s.baseBookingFeeCentavos,
    promoApplied: s.promoActive,
  };
}

export async function updateSystemSettings(args: {
  actorId: string;
  patch: Partial<Omit<SystemSettings, "id" | "updatedAt" | "updatedBy">>;
}): Promise<SystemSettings> {
  const { actorId, patch } = args;
  const updated = await db
    .update(systemSettings)
    .set({ ...patch, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(systemSettings.id, true))
    .returning();
  const row = updated[0];
  if (!row) throw new Error("system_settings row missing — apply migration 0007");
  return row;
}
