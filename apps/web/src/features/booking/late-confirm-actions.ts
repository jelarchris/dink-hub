"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/features/admin/service";
import { type ActionResult } from "@/features/auth";
import { lateConfirmPayment } from "@/features/booking/service";
import { isBookingError } from "@/features/booking/errors";
import { notifyLateConfirmed } from "@/features/booking/notifications";
import { findPaymentById } from "@/features/booking/repo";
import { captureException } from "@/lib/observability";

const lateConfirmSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Reason is required").max(500, "Reason too long"),
});

export async function lateConfirmPaymentAction(
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
    await lateConfirmPayment({
      paymentId: parsed.data.paymentId,
      adminId: admin.id,
      reason: parsed.data.reason,
    });
  } catch (err) {
    if (isBookingError(err)) return { ok: false, code: err.code, message: err.message };
    captureException(err, { scope: "payment.late-confirm.action" });
    return { ok: false, code: "unknown", message: "Something went wrong. Please try again." };
  }

  const payment = await findPaymentById(parsed.data.paymentId);
  if (payment) {
    const bookingId = payment.bookingId;
    const reason = parsed.data.reason;
    after(async () => {
      await notifyLateConfirmed(bookingId, reason);
    });
  }

  revalidatePath("/admin/payments/late-confirm");
  return { ok: true, data: null };
}
