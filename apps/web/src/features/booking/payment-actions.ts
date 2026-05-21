"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/service";
import { type ActionResult } from "@/features/auth";
import {
  rejectPayment,
  submitPayment,
  verifyPayment,
} from "@/features/booking/service";
import { isBookingError } from "@/features/booking/errors";
import {
  notifyPaymentRejected,
  notifyPaymentSubmitted,
  notifyPaymentVerified,
} from "@/features/booking/notifications";
import { findPaymentById } from "@/features/booking/repo";
import { findBookingDetailForPlayer } from "@/features/bookings-view";
import { uploadReceipt } from "@/features/storage";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import { captureException } from "@/lib/observability";

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isBookingError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  captureException(err, { scope: "payment.action" });
  return fail("Something went wrong. Please try again.");
}

const submitInputSchema = z.object({
  bookingId: z.string().uuid(),
  gcashReferenceNumber: z
    .string()
    .trim()
    .min(1, "GCash reference number is required")
    .min(6, "GCash reference must be at least 6 characters")
    .max(20, "GCash reference must be 20 characters or less"),
});

export async function submitReceiptAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  // Rate limit per user before any heavy work (file read, hash, storage put).
  const rl = await checkRateLimit(limiters.receiptUpload, `receipt:${user.id}`);
  if (!rl.allowed) return fail(rateLimitMessage(rl.resetMs), "rate_limited");

  const ref = form.get("gcashReferenceNumber");
  const parsed = submitInputSchema.safeParse({
    bookingId: form.get("bookingId"),
    gcashReferenceNumber: typeof ref === "string" ? ref : "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Re-load and authorize: only the booking's player can upload its receipt.
  const detail = await findBookingDetailForPlayer({
    bookingId: parsed.data.bookingId,
    playerId: user.id,
  });
  if (!detail) return fail("Booking not found", "booking_not_found");
  if (detail.booking.status !== "pending_payment") {
    return fail(`Cannot submit — booking is ${detail.booking.status.replace("_", " ")}`, "booking_wrong_status");
  }

  const file = form.get("receipt");
  if (!(file instanceof File)) return fail("Receipt image is required", "file_required");

  try {
    const upload = await uploadReceipt({ bookingId: parsed.data.bookingId, file });
    if (!upload.ok) {
      return { ok: false, code: upload.error.code, message: upload.error.message };
    }

    await submitPayment({
      bookingId: parsed.data.bookingId,
      playerId: user.id,
      receiptImagePath: upload.data.path,
      receiptHash: upload.data.hashHex,
      amountCentavos: detail.booking.totalCentavos,
      gcashReferenceNumber: parsed.data.gcashReferenceNumber,
    });
  } catch (err) {
    return unwrap(err);
  }

  // Side-effect: notify the venue owner after response is delivered.
  const submittedBookingId = parsed.data.bookingId;
  after(async () => {
    await notifyPaymentSubmitted(submittedBookingId);
  });

  revalidatePath(`/book/${submittedBookingId}/pay`);
  revalidatePath("/me/bookings");
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Owner verification actions
// ---------------------------------------------------------------------------

const verifySchema = z.object({ paymentId: z.string().uuid() });
const rejectSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Reason is required").max(500, "Reason too long"),
});

export async function verifyPaymentAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Not signed in", "not_authorized");

  const parsed = verifySchema.safeParse({ paymentId: form.get("paymentId") });
  if (!parsed.success) return fail("Invalid input", "validation_failed");

  try {
    await verifyPayment({ paymentId: parsed.data.paymentId, verifierId: user.id });
  } catch (err) {
    return unwrap(err);
  }

  // verifyPayment doesn't return the bookingId; re-resolve via the payment.
  // Cheap PK lookup.
  const payment = await findPaymentById(parsed.data.paymentId);
  if (payment) {
    const verifiedBookingId = payment.bookingId;
    after(async () => {
      await notifyPaymentVerified(verifiedBookingId);
    });
  }

  revalidatePath("/owner");
  revalidatePath("/owner/payments");
  return { ok: true, data: null };
}

export async function rejectPaymentAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Not signed in", "not_authorized");

  const parsed = rejectSchema.safeParse({
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
    await rejectPayment({
      paymentId: parsed.data.paymentId,
      verifierId: user.id,
      reason: parsed.data.reason,
    });
  } catch (err) {
    return unwrap(err);
  }

  const payment = await findPaymentById(parsed.data.paymentId);
  if (payment) {
    const rejectedBookingId = payment.bookingId;
    const rejectedReason = parsed.data.reason;
    after(async () => {
      await notifyPaymentRejected(rejectedBookingId, rejectedReason);
    });
  }

  revalidatePath("/owner");
  revalidatePath("/owner/payments");
  return { ok: true, data: null };
}
