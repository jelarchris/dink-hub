"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/service";
import type { ActionResult } from "@/features/auth/actions";

// Re-export so callers can import the type from here if needed.
export type { ActionResult };
import { updateProfileSchema } from "./schema";
import { updateProfile } from "./service";

function fail(message: string, code: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

export async function updateProfileAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to update your profile", "unauthenticated");

  const raw = {
    displayName: form.get("displayName"),
    phoneE164: form.get("phoneE164"),
    gender: form.get("gender") || undefined,
    city: form.get("city"),
    notifEmailDailyDigest: form.get("notifEmailDailyDigest") === "on",
    notifEmailPaymentSubmitted: form.get("notifEmailPaymentSubmitted") === "on",
    notifEmailBookingCancelled: form.get("notifEmailBookingCancelled") === "on",
  };

  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [field, errs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (errs) fieldErrors[field] = errs;
    }
    return fail("Please fix the errors below", "validation_failed", fieldErrors);
  }

  try {
    await updateProfile(user.id, parsed.data);
    revalidatePath("/me/profile");
    revalidatePath("/me");
    return { ok: true, data: {} };
  } catch (err) {
    console.error("[profile.update]", err);
    return fail("Something went wrong. Please try again.", "unknown");
  }
}
