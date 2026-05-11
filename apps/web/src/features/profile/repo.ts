import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";

/**
 * Fields the player can update on their own profile.
 * `null` = clear the field. `undefined` = leave unchanged.
 * For nested `notificationPrefs`, we always pass a complete object (form
 * checkboxes always emit a boolean, never undefined).
 */
export interface ProfilePatch {
  displayName: string;
  phoneE164?: string | null;
  gender?: Profile["gender"] | null;
  city?: string | null;
  notificationPrefs?: Profile["notificationPrefs"];
}

/**
 * Atomic profile update. Single UPDATE statement — no read-then-write race.
 * notificationPrefs is fully replaced (the caller composes the merged object).
 */
export async function updateProfileRow(
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const set: Partial<typeof profiles.$inferInsert> = {
    displayName: patch.displayName,
    updatedAt: new Date(),
  };
  if (patch.phoneE164 !== undefined) set.phoneE164 = patch.phoneE164;
  if (patch.gender !== undefined) set.gender = patch.gender;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.notificationPrefs !== undefined) set.notificationPrefs = patch.notificationPrefs;

  const rows = await db.update(profiles).set(set).where(eq(profiles.id, userId)).returning();
  const row = rows[0];
  if (!row) throw new Error(`Profile not found: ${userId}`);
  return row;
}

/**
 * Read just the notification prefs for merge-update flows.
 * Returns null if profile doesn't exist.
 */
export async function getNotificationPrefs(
  userId: string,
): Promise<Profile["notificationPrefs"] | null> {
  const rows = await db
    .select({ prefs: profiles.notificationPrefs })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0]?.prefs ?? null;
}
