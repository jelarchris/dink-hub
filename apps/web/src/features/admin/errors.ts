export type AdminErrorCode =
  | "not_admin"
  | "unauthenticated"
  | "venue_not_found"
  | "user_not_found"
  | "payout_not_found"
  | "payout_overlap"
  | "no_bookings"
  | "payment_not_found"
  | "invoice_not_found"
  | "invalid_status_transition"
  | "cannot_self_modify"
  | "version_conflict"
  | "validation"
  | "fee_unchanged"
  | "unknown";

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  constructor(code: AdminErrorCode, message: string) {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

export function isAdminError(err: unknown): err is AdminError {
  return err instanceof AdminError;
}
