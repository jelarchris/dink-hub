/**
 * Typed domain errors for the open-play feature. Mirrors the booking pattern:
 * services throw `OpenPlayError(code, message)`, actions translate `.code` to
 * an HTTP/UI response, and unknown errors bubble to Sentry.
 */

export type OpenPlayErrorCode =
  | "validation_failed"
  | "not_authorized"
  | "venue_not_found"
  | "venue_inactive"
  | "court_not_found"
  | "court_inactive"
  | "court_closed"
  | "session_not_found"
  | "session_not_published"
  | "session_wrong_status"
  | "session_already_started"
  | "session_full"
  | "slot_not_available" // shadow booking EXCLUDE hit
  | "already_signed_up"
  | "signup_not_found"
  | "signup_not_owned"
  | "signup_not_cancellable"
  | "signup_wrong_status"
  | "payment_not_found"
  | "payment_already_verified"
  | "duplicate_receipt"
  | "system_fee_unavailable"
  | "concurrent_modification";

export class OpenPlayError extends Error {
  public readonly code: OpenPlayErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  constructor(code: OpenPlayErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "OpenPlayError";
    this.code = code;
    this.details = details;
  }
}

export function isOpenPlayError(err: unknown): err is OpenPlayError {
  return err instanceof OpenPlayError;
}
