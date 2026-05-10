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

export const PAGE_SIZE = 25;
