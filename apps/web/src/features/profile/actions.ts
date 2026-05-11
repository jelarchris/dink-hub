"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/service";
import type { ActionResult } from "@/features/auth/actions";
import { captureException } from "@/lib/observability";
import { updateProfile, ProfileValidationError } from "./service";

// Re-exported for callers that wire forms with useActionState.
export type { ActionResult };

function fail(
  message: string,
  code: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/**
 * Server action: update the current user's own profile.
 *
 * Auth: re-checks the session — never trust the form. The service receives
 * `user.id` from the session, so a malicious payload cannot target another
 * user's row.
 *
 * Idempotent: re-submitting the same values is a no-op (single UPDATE).
 */
export async function updateProfileAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to update your profile", "unauthenticated");

  // Build raw input from the form. Checkbox absence == false (HTML default),
  // so notif prefs are always booleans, never undefined.
  const genderRaw = form.get("gender");
  const raw = {
    displayName: form.get("displayName") ?? "",
    phoneE164: form.get("phoneE164") ?? "",
    gender: typeof genderRaw === "string" && genderRaw !== "" ? genderRaw : undefined,
    city: form.get("city") ?? "",
    notifEmailDailyDigest: form.get("notifEmailDailyDigest") === "on",
    notifEmailPaymentSubmitted: form.get("notifEmailPaymentSubmitted") === "on",
    notifEmailBookingCancelled: form.get("notifEmailBookingCancelled") === "on",
  };

  try {
    await updateProfile(user.id, raw);
    revalidatePath("/me/profile");
    revalidatePath("/me");
    return { ok: true, data: {} };
  } catch (err) {
    if (err instanceof ProfileValidationError) {
      return fail("Please fix the errors below", err.code, err.fieldErrors);
    }
    captureException(err, { scope: "profile.update", userId: user.id });
    return fail("Something went wrong. Please try again.", "unknown");
  }
}
