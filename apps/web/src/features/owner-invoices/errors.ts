/**
 * Typed errors for the owner-invoices feature. Server actions translate these
 * into the standard ActionResult shape; UI never sees the raw error.
 */
export type OwnerInvoiceErrorCode =
  | "validation_failed"
  | "invoice_not_found"
  | "invoice_not_owned"
  | "invoice_wrong_status"
  | "amount_mismatch"
  | "concurrent_modification";

export class OwnerInvoiceError extends Error {
  readonly code: OwnerInvoiceErrorCode;
  readonly details?: unknown;

  constructor(code: OwnerInvoiceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "OwnerInvoiceError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isOwnerInvoiceError(err: unknown): err is OwnerInvoiceError {
  return err instanceof OwnerInvoiceError;
}
