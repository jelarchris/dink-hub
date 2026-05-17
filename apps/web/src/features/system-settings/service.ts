import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { systemSettings, type SystemSettings } from "@/db/schema";

/**
 * Read the singleton platform settings row.
 *
 * Wrapped in React.cache so multiple Server Components in the same request
 * (booking flow + admin pages) share a single DB round-trip.
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

export interface BookingFeeRule {
  /** What to snapshot to the booking row right now. */
  snapshotCentavos: bigint;
  /** What the displayed "base" fee is. */
  baseCentavos: bigint;
}

export async function getCurrentBookingFeeRule(): Promise<BookingFeeRule> {
  const s = await getSystemSettings();
  return {
    snapshotCentavos: s.baseBookingFeeCentavos,
    baseCentavos: s.baseBookingFeeCentavos,
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
