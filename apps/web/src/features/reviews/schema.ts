import { z } from "zod";

export const submitReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const editReviewSchema = z.object({
  reviewId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
});
export type EditReviewInput = z.infer<typeof editReviewSchema>;

export const ownerReplySchema = z.object({
  reviewId: z.string().uuid(),
  reply: z.string().min(1).max(1000),
});
export type OwnerReplyInput = z.infer<typeof ownerReplySchema>;
