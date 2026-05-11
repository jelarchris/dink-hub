import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";
import type { UpdateProfileInput } from "./schema";

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const patch: Partial<typeof profiles.$inferInsert> = {
    displayName: input.displayName.trim(),
    updatedAt: new Date(),
  };

  // Only update phone when explicitly provided.
  if (input.phoneE164 !== undefined) {
    patch.phoneE164 = input.phoneE164 === "" ? null : input.phoneE164;
  }
  if (input.gender !== undefined) {
    // Cast: Drizzle enum type is narrower than the string union here.
    patch.gender = input.gender as typeof profiles.$inferInsert["gender"];
  }
  if (input.city !== undefined) {
    patch.city = input.city.trim() === "" ? null : input.city.trim();
  }

  // Notification prefs: merge, not replace.
  const existing = await db
    .select({ notificationPrefs: profiles.notificationPrefs })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const currentPrefs = existing[0]?.notificationPrefs ?? {
    email_daily_digest: true,
    email_on_payment_submitted: true,
    email_on_booking_cancelled: true,
  };

  if (
    input.notifEmailDailyDigest !== undefined ||
    input.notifEmailPaymentSubmitted !== undefined ||
    input.notifEmailBookingCancelled !== undefined
  ) {
    patch.notificationPrefs = {
      email_daily_digest: input.notifEmailDailyDigest ?? currentPrefs.email_daily_digest,
      email_on_payment_submitted:
        input.notifEmailPaymentSubmitted ?? currentPrefs.email_on_payment_submitted,
      email_on_booking_cancelled:
        input.notifEmailBookingCancelled ?? currentPrefs.email_on_booking_cancelled,
    };
  }

  const rows = await db
    .update(profiles)
    .set(patch)
    .where(eq(profiles.id, userId))
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Profile update returned no rows");
  return row;
}
