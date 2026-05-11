"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult } from "@/features/auth";
import { getSessionUser } from "@/server/session";
import { captureException } from "@/lib/observability";
import { updateOwnerNotificationPrefs } from "./service";

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

async function ensureOwner(): Promise<
  { ok: true; userId: string } | { ok: false; result: ActionResult<never> }
> {
  const profile = await getSessionUser();
  if (!profile) return { ok: false, result: fail("Sign in required.", "unauthenticated") };
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return { ok: false, result: fail("Only venue owners can update notification settings.", "not_owner") };
  }
  return { ok: true, userId: profile.id };
}

/**
 * Persists owner notification preferences from the settings form.
 * Checkboxes are absent from FormData when unchecked, so we treat any
 * missing key as `false`.
 */
export async function updateNotificationPrefsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const gate = await ensureOwner();
  if (!gate.ok) return gate.result;

  const raw = {
    email_daily_digest: formData.get("email_daily_digest") === "on",
    email_on_payment_submitted: formData.get("email_on_payment_submitted") === "on",
    email_on_booking_cancelled: formData.get("email_on_booking_cancelled") === "on",
  };

  try {
    await updateOwnerNotificationPrefs(gate.userId, raw);
    revalidatePath("/owner/settings");
    return { ok: true, data: { saved: true } };
  } catch (err) {
    captureException(err, { scope: "owner-settings.updateNotificationPrefs" });
    return fail("Failed to save preferences. Please try again.");
  }
}
