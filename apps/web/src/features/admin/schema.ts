import { z } from "zod";

// ----------------------------------------------------------------------------
// Common
// ----------------------------------------------------------------------------
export const uuidSchema = z.string().uuid();

const optionalReason = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

// ----------------------------------------------------------------------------
// Venue review actions
// ----------------------------------------------------------------------------
export const venueReviewActionSchema = z.enum(["approve", "reject", "suspend", "reinstate"]);
export type VenueReviewAction = z.infer<typeof venueReviewActionSchema>;

export const venueReviewInputSchema = z.object({
  venueId: uuidSchema,
  expectedVersion: z.coerce.number().int().min(1),
  action: venueReviewActionSchema,
  reason: optionalReason,
});
export type VenueReviewInput = z.infer<typeof venueReviewInputSchema>;

// ----------------------------------------------------------------------------
// User role / suspension
// ----------------------------------------------------------------------------
export const roleValues = ["player", "venue_owner", "admin"] as const;
export const userRoleSchema = z.enum(roleValues);
export type UserRoleValue = z.infer<typeof userRoleSchema>;

export const updateUserRoleInputSchema = z.object({
  userId: uuidSchema,
  role: userRoleSchema,
  reason: optionalReason,
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleInputSchema>;

export const userSuspensionActionSchema = z.enum(["suspend", "reinstate"]);
export type UserSuspensionAction = z.infer<typeof userSuspensionActionSchema>;

export const setUserSuspensionInputSchema = z.object({
  userId: uuidSchema,
  action: userSuspensionActionSchema,
  reason: optionalReason,
});
export type SetUserSuspensionInput = z.infer<typeof setUserSuspensionInputSchema>;

// ----------------------------------------------------------------------------
// System fee
// ----------------------------------------------------------------------------
const phpAmountSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^\d+(\.\d{1,2})?$/, "Use a number like 20 or 20.50")
  .refine((s) => Number(s) >= 0, "Must be zero or more")
  .refine((s) => Number(s) <= 10_000, "Looks too high (max ₱10,000)");

export const updateSystemFeeInputSchema = z.object({
  feePhp: phpAmountSchema,
  notes: optionalReason,
});
export type UpdateSystemFeeInput = z.infer<typeof updateSystemFeeInputSchema>;

export function phpStringToCentavos(decimal: string): bigint {
  const [whole = "0", frac = ""] = decimal.split(".");
  const padded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(padded);
}

// ----------------------------------------------------------------------------
// Booking force-cancel
// ----------------------------------------------------------------------------
export const forceCancelBookingInputSchema = z.object({
  bookingId: uuidSchema,
  expectedVersion: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, "Reason is required").max(500),
});
export type ForceCancelBookingInput = z.infer<typeof forceCancelBookingInputSchema>;

// ----------------------------------------------------------------------------
// List filters
// ----------------------------------------------------------------------------
export const venueListFilterSchema = z.object({
  status: z.enum(["all", "draft", "pending_review", "active", "suspended", "rejected"]).default("all"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type VenueListFilter = z.infer<typeof venueListFilterSchema>;

export const userListFilterSchema = z.object({
  role: z.enum(["all", "player", "venue_owner", "admin"]).default("all"),
  status: z.enum(["all", "active", "suspended"]).default("all"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type UserListFilter = z.infer<typeof userListFilterSchema>;

export const bookingListFilterSchema = z.object({
  status: z
    .enum([
      "all",
      "pending_payment",
      "payment_submitted",
      "confirmed",
      "cancelled",
      "no_show",
      "expired",
      "refunded",
    ])
    .default("all"),
  venueId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type BookingListFilter = z.infer<typeof bookingListFilterSchema>;

export const auditListFilterSchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  targetType: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AuditListFilter = z.infer<typeof auditListFilterSchema>;

// ----------------------------------------------------------------------------
// Payouts
// ----------------------------------------------------------------------------
const isoDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const payoutStatusValues = [
  "pending",
  "processing",
  "paid",
  "failed",
  "on_hold",
] as const;

export const payoutListFilterSchema = z.object({
  status: z.enum(["all", ...payoutStatusValues]).default("all"),
  venueId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type PayoutListFilter = z.infer<typeof payoutListFilterSchema>;

export const generatePayoutInputSchema = z
  .object({
    venueId: uuidSchema,
    periodStart: isoDateOnly,
    periodEnd: isoDateOnly,
    notes: optionalReason,
  })
  .refine((v) => v.periodStart < v.periodEnd, {
    message: "Period start must be before end.",
    path: ["periodEnd"],
  });
export type GeneratePayoutInput = z.infer<typeof generatePayoutInputSchema>;

export const markPayoutPaidInputSchema = z.object({
  payoutId: uuidSchema,
  expectedVersion: z.coerce.number().int().min(1),
  paidReference: z
    .string()
    .trim()
    .min(3, "Reference is required (e.g. GCash transfer ref)")
    .max(120),
  notes: optionalReason,
});
export type MarkPayoutPaidInput = z.infer<typeof markPayoutPaidInputSchema>;

export const togglePayoutHoldInputSchema = z.object({
  payoutId: uuidSchema,
  expectedVersion: z.coerce.number().int().min(1),
  action: z.enum(["hold", "release"]),
  reason: optionalReason,
});
export type TogglePayoutHoldInput = z.infer<typeof togglePayoutHoldInputSchema>;

// ----------------------------------------------------------------------------
// Ledger inspector
// ----------------------------------------------------------------------------
export const ledgerAccountValues = [
  "venue_payable",
  "platform_revenue",
  "platform_cash",
  "venue_refund",
  "fee_writeoff",
] as const;

export const ledgerListFilterSchema = z.object({
  account: z.enum(["all", ...ledgerAccountValues]).default("all"),
  bookingId: z.string().uuid().optional(),
  payoutId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type LedgerListFilter = z.infer<typeof ledgerListFilterSchema>;

export const PAGE_SIZE = 25;
