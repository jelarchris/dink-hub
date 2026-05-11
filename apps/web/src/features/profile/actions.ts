"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/service";
import type { ActionResult } from "@/features/auth/actions";
import { captureException } from "@/lib/observability";
import { updateProfile, ProfileValidationError } from "./service";

function fail(
  message: string,
  code: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

function strOrEmpty(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

/**
 * Server action: update the current user's own profile.
 *
 * Auth: re-checks the session — never trust the form. The service receives
 * `user.id` from the session, so a malicious payload cannot target another
 * user's row.
 *
 * Idempotent: re-submitting the same values is a no-op (single UPDATE).
 *
 * Top-level try/catch is mandatory — a "use server" function that throws
 * surfaces as a 500 + opaque digest in production. We must always return
 * an ActionResult so the form's useActionState gets a real value back.
 */
export async function updateProfileAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Sign in to update your profile", "unauthenticated");

    const genderRaw = form.get("gender");
    const raw = {
      displayName: strOrEmpty(form.get("displayName")),
      phoneE164: strOrEmpty(form.get("phoneE164")),
      gender: typeof genderRaw === "string" && genderRaw !== "" ? genderRaw : undefined,
      city: strOrEmpty(form.get("city")),
      notifEmailDailyDigest: form.get("notifEmailDailyDigest") === "on",
      notifEmailPaymentSubmitted: form.get("notifEmailPaymentSubmitted") === "on",
      notifEmailBookingCancelled: form.get("notifEmailBookingCancelled") === "on",
    };

    try {
      await updateProfile(user.id, raw);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        return fail("Please fix the errors below", err.code, err.fieldErrors);
      }
      captureException(err, { scope: "profile.update", userId: user.id });
      return fail("Something went wrong. Please try again.", "unknown");
    }

    revalidatePath("/me/profile");
    revalidatePath("/me");
    return { ok: true, data: {} };
  } catch (err) {
    // Last-resort guard: never let a throw escape to a 500/opaque digest.
    captureException(err, { scope: "profile.action.outer" });
    return fail("Something went wrong. Please try again.", "unknown");
  }
}
