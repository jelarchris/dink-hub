import "server-only";
import { ZodError } from "zod";
import type { Profile } from "@/db/schema";
import { updateProfileSchema, type UpdateProfileInput } from "./schema";
import { getNotificationPrefs, updateProfileRow, type ProfilePatch } from "./repo";

export class ProfileValidationError extends Error {
  readonly code = "validation_failed";
  readonly fieldErrors: Record<string, string[]>;
  constructor(fieldErrors: Record<string, string[]>) {
    super("Profile validation failed");
    this.fieldErrors = fieldErrors;
  }
}

const DEFAULT_PREFS = {
  email_daily_digest: true,
  email_on_payment_submitted: true,
  email_on_booking_cancelled: true,
} as const;

/**
 * Update the current user's own profile. Authorization (userId === auth.id)
 * is enforced by the caller (action). This service trusts userId.
 *
 * Notif prefs jsonb: we rebuild the full object so the DB check constraint
 * stays satisfied as keys evolve.
 */
export async function updateProfile(userId: string, raw: unknown): Promise<Profile> {
  let input: UpdateProfileInput;
  try {
    input = updateProfileSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      const flat = err.flatten().fieldErrors as Record<string, string[] | undefined>;
      for (const [field, errs] of Object.entries(flat)) {
        if (errs && errs.length > 0) fieldErrors[field] = errs;
      }
      throw new ProfileValidationError(fieldErrors);
    }
    throw err;
  }

  const patch: ProfilePatch = {
    displayName: input.displayName.trim(),
  };

  if (input.phoneE164 !== undefined) {
    patch.phoneE164 = input.phoneE164 === "" ? null : input.phoneE164;
  }
  if (input.gender !== undefined) {
    patch.gender = input.gender;
  }
  if (input.city !== undefined) {
    const trimmed = input.city.trim();
    patch.city = trimmed === "" ? null : trimmed;
  }

  const sentNotif =
    input.notifEmailDailyDigest !== undefined ||
    input.notifEmailPaymentSubmitted !== undefined ||
    input.notifEmailBookingCancelled !== undefined;

  if (sentNotif) {
    const current = (await getNotificationPrefs(userId)) ?? DEFAULT_PREFS;
    patch.notificationPrefs = {
      email_daily_digest: input.notifEmailDailyDigest ?? current.email_daily_digest,
      email_on_payment_submitted:
        input.notifEmailPaymentSubmitted ?? current.email_on_payment_submitted,
      email_on_booking_cancelled:
        input.notifEmailBookingCancelled ?? current.email_on_booking_cancelled,
    };
  }

  return updateProfileRow(userId, patch);
}
