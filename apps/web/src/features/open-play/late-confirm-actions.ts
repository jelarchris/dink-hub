"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/admin/service";
import { type ActionResult } from "@/features/auth";
import { isOpenPlayError, lateConfirmSignupPayment } from "@/features/open-play";
import { findSignupPaymentById } from "@/features/open-play/repo";
import { notifyOpenPlaySignupLateConfirmed } from "@/features/open-play/notifications";
import { captureException } from "@/lib/observability";

const lateConfirmSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Reason is required").max(500, "Reason too long"),
});

export async function lateConfirmSignupPaymentAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  // Hard authorization at the action boundary (defense in depth — admin layout
  // protects the page, but Server Actions can be invoked from anywhere).
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, code: "not_authorized", message: "Admin access required" };
  }

  const parsed = lateConfirmSchema.safeParse({
    paymentId: form.get("paymentId"),
    reason: form.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Reason required",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await lateConfirmSignupPayment({
      paymentId: parsed.data.paymentId,
      adminId: admin.id,
      reason: parsed.data.reason,
    });
  } catch (err) {
    if (isOpenPlayError(err)) return { ok: false, code: err.code, message: err.message };
    captureException(err, { scope: "open-play.late-confirm.action" });
    return { ok: false, code: "unknown", message: "Something went wrong. Please try again." };
  }

  const payment = await findSignupPaymentById(parsed.data.paymentId);
  if (payment) {
    const signupId = payment.signupId;
    const reason = parsed.data.reason;
    after(async () => {
      await notifyOpenPlaySignupLateConfirmed(signupId, reason);
    });
  }

  revalidatePath("/admin/open-play/late-confirm");
  return { ok: true, data: null };
}
