"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/service";
import type { ActionResult } from "@/features/auth/actions";
import { editReview, replyToReview, submitReview } from "./service";
import { isReviewError } from "./errors";

function fail(message: string, code: string): ActionResult {
  return { ok: false, code, message };
}

// ============================================================================
// submitReviewAction — player submits a review from their booking list / detail
// ============================================================================
export async function submitReviewAction(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to leave a review", "unauthenticated");

  const bookingId = form.get("bookingId");
  const ratingRaw = form.get("rating");
  const body = form.get("body");

  if (typeof bookingId !== "string" || typeof ratingRaw !== "string") {
    return fail("Invalid form data", "validation_failed");
  }
  const rating = parseInt(ratingRaw, 10);

  try {
    await submitReview(user.id, {
      bookingId,
      rating,
      ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
    });
    revalidatePath("/me/bookings");
    return { ok: true, data: {} };
  } catch (err) {
    if (isReviewError(err)) return fail(err.message, err.code);
    throw err;
  }
}

// ============================================================================
// editReviewAction — player edits rating/body before owner has replied
// ============================================================================
export async function editReviewAction(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in to edit your review", "unauthenticated");

  const reviewId = form.get("reviewId");
  const ratingRaw = form.get("rating");
  const body = form.get("body");

  if (typeof reviewId !== "string" || typeof ratingRaw !== "string") {
    return fail("Invalid form data", "validation_failed");
  }
  const rating = parseInt(ratingRaw, 10);

  try {
    await editReview(user.id, {
      reviewId,
      rating,
      ...(typeof body === "string" && body.trim() ? { body: body.trim() } : {}),
    });
    revalidatePath("/me/bookings");
    return { ok: true, data: {} };
  } catch (err) {
    if (isReviewError(err)) return fail(err.message, err.code);
    throw err;
  }
}

// ============================================================================
// ownerReplyAction — venue owner posts a reply to a review
// ============================================================================
export async function ownerReplyAction(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Sign in as venue owner", "unauthenticated");

  const reviewId = form.get("reviewId");
  const reply = form.get("reply");

  if (typeof reviewId !== "string" || typeof reply !== "string" || !reply.trim()) {
    return fail("Invalid form data", "validation_failed");
  }

  try {
    await replyToReview(user.id, { reviewId, reply: reply.trim() });
    revalidatePath("/owner");
    revalidatePath("/owner/reviews");
    return { ok: true, data: {} };
  } catch (err) {
    if (isReviewError(err)) return fail(err.message, err.code);
    throw err;
  }
}
