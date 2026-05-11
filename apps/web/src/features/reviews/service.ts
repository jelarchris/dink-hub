import "server-only";
import type { Review } from "@/db/schema";
import { ReviewError } from "./errors";
import * as repo from "./repo";
import { editReviewSchema, ownerReplySchema, submitReviewSchema } from "./schema";
import type { EditReviewInput, OwnerReplyInput, SubmitReviewInput } from "./schema";

const PG_UNIQUE_VIOLATION = "23505";
function isPgUnique(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: unknown }).code === PG_UNIQUE_VIOLATION) return true;
  if ("cause" in err) return isPgUnique((err as { cause: unknown }).cause);
  return false;
}

// ============================================================================
// submitReview — player leaves a review after their booking is done
// ============================================================================
export async function submitReview(
  playerId: string,
  input: SubmitReviewInput,
): Promise<Review> {
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewError("validation_failed", "Invalid review input");
  }
  const { bookingId, rating, body } = parsed.data;

  // Verify booking exists, belongs to player, is confirmed, and end_at is past.
  const booking = await repo.findReviewableBooking(bookingId, playerId);
  if (!booking) {
    throw new ReviewError("booking_not_found", "Booking not found or does not belong to you");
  }
  if (booking.status !== "confirmed") {
    throw new ReviewError("booking_not_reviewable", "Only confirmed bookings can be reviewed");
  }
  if (booking.endAt.getTime() > Date.now()) {
    throw new ReviewError("booking_not_reviewable", "You can only review a booking after it has ended");
  }

  try {
    const insertInput: Parameters<typeof repo.insertReview>[0] = {
      bookingId,
      playerId,
      venueId: booking.venueId,
      rating,
    };
    if (body !== undefined && body !== "") insertInput.body = body;
    return await repo.insertReview(insertInput);
  } catch (err) {
    if (isPgUnique(err)) {
      throw new ReviewError("review_already_exists", "You have already reviewed this booking");
    }
    throw err;
  }
}

// ============================================================================
// editReview — player updates rating/body before owner has replied
// ============================================================================
export async function editReview(
  playerId: string,
  input: EditReviewInput,
): Promise<Review> {
  const parsed = editReviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewError("validation_failed", "Invalid review edit input");
  }
  const { reviewId, rating, body } = parsed.data;

  const review = await repo.findReviewById(reviewId);
  if (!review) throw new ReviewError("review_not_found", "Review not found");
  if (review.playerId !== playerId) throw new ReviewError("not_authorized", "Not your review");
  if (review.ownerReply !== null) {
    throw new ReviewError("edit_locked", "Cannot edit after the owner has replied");
  }

  const patch: Parameters<typeof repo.updateReviewByPlayer>[1] = { rating };
  if (body !== undefined) patch.body = body;
  const updated = await repo.updateReviewByPlayer(reviewId, patch);
  if (!updated) throw new ReviewError("review_not_found", "Review not found");
  return updated;
}

// ============================================================================
// replyToReview — venue owner adds a reply
// ============================================================================
export async function replyToReview(
  ownerId: string,
  input: OwnerReplyInput,
): Promise<Review> {
  const parsed = ownerReplySchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewError("validation_failed", "Invalid reply input");
  }
  const { reviewId, reply } = parsed.data;

  const review = await repo.findReviewForOwner(reviewId, ownerId);
  if (!review) throw new ReviewError("review_not_found", "Review not found");

  const updated = await repo.setOwnerReply(reviewId, reply);
  if (!updated) throw new ReviewError("review_not_found", "Review not found");
  return updated;
}

// ============================================================================
// hideReview / showReview — admin moderation
// ============================================================================
export async function hideReview(reviewId: string): Promise<Review> {
  const updated = await repo.setReviewHidden(reviewId, true);
  if (!updated) throw new ReviewError("review_not_found", "Review not found");
  return updated;
}

export async function showReview(reviewId: string): Promise<Review> {
  const updated = await repo.setReviewHidden(reviewId, false);
  if (!updated) throw new ReviewError("review_not_found", "Review not found");
  return updated;
}

// ============================================================================
// Re-export read functions for server components
// ============================================================================
export {
  findReviewForBooking,
  getVenueRating,
  listReviewsForOwner,
  listReviewsForVenue,
} from "./repo";
