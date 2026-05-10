import { z } from "zod";

/**
 * Inputs for an owner submitting payment for one weekly invoice.
 *
 * `gcashReferenceNumber` is optional but strongly encouraged — admins use it
 * to cross-check the GCash transaction during verification. Empty strings
 * coming off the form are normalised to `undefined`.
 */
export const submitInvoicePaymentInputSchema = z.object({
  invoiceId: z.string().uuid(),
  receiptImagePath: z.string().min(1),
  receiptHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Receipt hash must be 64 hex chars (sha256)"),
  amountPaidCentavos: z
    .bigint()
    .positive("Amount must be greater than zero"),
  gcashReferenceNumber: z
    .string()
    .trim()
    .min(6, "GCash reference must be at least 6 characters")
    .max(40, "GCash reference must be 40 characters or less")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type SubmitInvoicePaymentInput = z.infer<typeof submitInvoicePaymentInputSchema>;
