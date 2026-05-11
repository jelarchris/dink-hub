export type ReviewErrorCode =
  | "validation_failed"
  | "booking_not_found"
  | "booking_not_reviewable" // not confirmed, not in the past, or not the player's booking
  | "review_already_exists"
  | "review_not_found"
  | "not_authorized"
  | "edit_locked"; // player tried to edit after owner replied

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}

export function isReviewError(err: unknown): err is ReviewError {
  return err instanceof ReviewError;
}
