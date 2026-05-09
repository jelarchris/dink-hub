/**
 * Typed domain errors for the booking feature.
 *
 * Service consumers (route handlers, server actions, RPCs) should:
 *   1. Catch BookingError and translate `.code` to an HTTP status / UI message.
 *   2. Let unknown errors bubble up — they are bugs and should hit Sentry.
 */

export type BookingErrorCode =
  | "validation_failed"
  | "court_not_found"
  | "court_inactive"
  | "venue_inactive"
  | "slot_not_available" // EXCLUDE constraint hit OR overlapping hold
  | "hold_not_found"
  | "hold_expired"
  | "hold_not_owned"
  | "booking_not_found"
  | "booking_not_owned"
  | "booking_not_cancellable" // outside 15-min window or wrong status
  | "booking_wrong_status"
  | "payment_not_found"
  | "payment_already_verified"
  | "payment_amount_mismatch"
  | "duplicate_receipt" // same hash already submitted for this booking
  | "not_authorized" // caller is not venue owner / admin for the action
  | "system_fee_unavailable"
  | "concurrent_modification"; // optimistic lock failed

export class BookingError extends Error {
  public readonly code: BookingErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  constructor(code: BookingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.details = details;
  }
}

export function isBookingError(err: unknown): err is BookingError {
  return err instanceof BookingError;
}
