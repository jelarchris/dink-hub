import "server-only";
import { and, avg, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  profiles,
  reviews,
  venues,
  type Booking,
  type Review,
} from "@/db/schema";

// ----------------------------------------------------------------------------
// Public venue aggregate — avg rating + count of visible reviews.
// Returns null when there are no reviews yet.
// ----------------------------------------------------------------------------
export async function getVenueRating(
  venueId: string,
): Promise<{ avgRating: number; reviewCount: number } | null> {
  const rows = await db
    .select({
      avgRating: avg(reviews.rating).mapWith(Number),
      reviewCount: count(reviews.id).mapWith(Number),
    })
    .from(reviews)
    .where(and(eq(reviews.venueId, venueId), eq(reviews.isHidden, false)));
  const row = rows[0];
  if (!row || row.reviewCount === 0) return null;
  return { avgRating: row.avgRating, reviewCount: row.reviewCount };
}

// ----------------------------------------------------------------------------
// Public venue review list with player display name.
// ----------------------------------------------------------------------------
export interface ReviewListItem {
  review: Review;
  playerDisplayName: string;
}

export async function listReviewsForVenue(
  venueId: string,
  limit = 20,
  offset = 0,
): Promise<ReviewListItem[]> {
  const rows = await db
    .select({ review: reviews, playerName: profiles.displayName })
    .from(reviews)
    .innerJoin(profiles, eq(profiles.id, reviews.playerId))
    .where(and(eq(reviews.venueId, venueId), eq(reviews.isHidden, false)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    review: r.review,
    playerDisplayName: r.playerName ?? "Anonymous",
  }));
}

// ----------------------------------------------------------------------------
// Fetch a single review by ID. No visibility filter — used by owner/admin.
// ----------------------------------------------------------------------------
export async function findReviewById(reviewId: string): Promise<Review | null> {
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return rows[0] ?? null;
}

// ----------------------------------------------------------------------------
// Find the review the player left for a specific booking (if any).
// ----------------------------------------------------------------------------
export async function findReviewForBooking(
  bookingId: string,
): Promise<Review | null> {
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1);
  return rows[0] ?? null;
}

// ----------------------------------------------------------------------------
// Owner review list — all reviews for venues owned by ownerId, including
// hidden, ordered by created_at DESC. Limit 100.
// ----------------------------------------------------------------------------
export interface OwnerReviewListItem {
  review: Review;
  playerDisplayName: string;
  venueName: string;
}

export async function listReviewsForOwner(
  ownerId: string,
  limit = 100,
): Promise<OwnerReviewListItem[]> {
  const rows = await db
    .select({
      review: reviews,
      playerName: profiles.displayName,
      venueName: venues.name,
    })
    .from(reviews)
    .innerJoin(venues, and(eq(venues.id, reviews.venueId), eq(venues.ownerId, ownerId), isNull(venues.deletedAt)))
    .innerJoin(profiles, eq(profiles.id, reviews.playerId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    review: r.review,
    playerDisplayName: r.playerName ?? "Anonymous",
    venueName: r.venueName,
  }));
}

// ----------------------------------------------------------------------------
// Verify booking is reviewable: confirmed + end_at in the past + belongs to player.
// ----------------------------------------------------------------------------
export async function findReviewableBooking(
  bookingId: string,
  playerId: string,
): Promise<Pick<Booking, "id" | "venueId" | "status" | "endAt"> | null> {
  const rows = await db
    .select({
      id: bookings.id,
      venueId: bookings.venueId,
      status: bookings.status,
      endAt: bookings.endAt,
    })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.playerId, playerId)))
    .limit(1);
  return rows[0] ?? null;
}

// ----------------------------------------------------------------------------
// Inserts
// ----------------------------------------------------------------------------
export async function insertReview(input: {
  bookingId: string;
  playerId: string;
  venueId: string;
  rating: number;
  body?: string;
}): Promise<Review> {
  const rows = await db
    .insert(reviews)
    .values({
      bookingId: input.bookingId,
      playerId: input.playerId,
      venueId: input.venueId,
      rating: input.rating,
      body: input.body ?? null,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("insert review returned no rows");
  return row;
}

// ----------------------------------------------------------------------------
// Updates
// ----------------------------------------------------------------------------
export async function updateReviewByPlayer(
  reviewId: string,
  patch: { rating: number; body?: string },
): Promise<Review | null> {
  const rows = await db
    .update(reviews)
    .set({ rating: patch.rating, body: patch.body ?? null, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId))
    .returning();
  return rows[0] ?? null;
}

export async function setOwnerReply(
  reviewId: string,
  reply: string,
): Promise<Review | null> {
  const rows = await db
    .update(reviews)
    .set({ ownerReply: reply, ownerRepliedAt: new Date(), updatedAt: new Date() })
    .where(eq(reviews.id, reviewId))
    .returning();
  return rows[0] ?? null;
}

export async function setReviewHidden(
  reviewId: string,
  hidden: boolean,
): Promise<Review | null> {
  const rows = await db
    .update(reviews)
    .set({ isHidden: hidden, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId))
    .returning();
  return rows[0] ?? null;
}

// ----------------------------------------------------------------------------
// Venue owner check — confirm reviewId belongs to a venue owned by ownerId.
// ----------------------------------------------------------------------------
export async function findReviewForOwner(
  reviewId: string,
  ownerId: string,
): Promise<Review | null> {
  const rows = await db
    .select({ review: reviews })
    .from(reviews)
    .innerJoin(venues, and(eq(venues.id, reviews.venueId), eq(venues.ownerId, ownerId)))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return rows[0]?.review ?? null;
}

// ----------------------------------------------------------------------------
// Admin helper — find review by ID regardless of hidden status.
// ----------------------------------------------------------------------------
export async function findReviewForAdmin(reviewId: string): Promise<Review | null> {
  return findReviewById(reviewId);
}
