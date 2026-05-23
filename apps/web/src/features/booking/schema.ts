import { z } from "zod";

/**
 * Zod schemas for every public service input. The runtime boundary contract.
 * Time validation rules:
 *   - 1-hour grain (also enforced by DB CHECK constraint)
 *   - duration: 60 min <= d <= 4 h, in 60-min increments
 *   - endAt strictly after startAt
 * `startAt` being in the future is checked in the service (not schema) so we can
 * unit-test schemas without time mocking.
 */

const uuidSchema = z.string().uuid();
const positiveBigInt = z.bigint().refine((v) => v > 0n, "must be positive");

function validateSlotTimes(d: { startAt: Date; endAt: Date }, ctx: z.RefinementCtx): void {
  if (d.endAt.getTime() <= d.startAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endAt must be after startAt",
      path: ["endAt"],
    });
    return;
  }
  const minutes = (d.endAt.getTime() - d.startAt.getTime()) / 60_000;
  if (minutes < 60 || minutes > 240 || minutes % 60 !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "duration must be 1 to 4 hours in 1-hour increments",
      path: ["endAt"],
    });
  }
  const aligned =
    d.startAt.getUTCSeconds() === 0 &&
    d.startAt.getUTCMilliseconds() === 0 &&
    d.startAt.getUTCMinutes() === 0 &&
    d.endAt.getUTCSeconds() === 0 &&
    d.endAt.getUTCMilliseconds() === 0 &&
    d.endAt.getUTCMinutes() === 0;
  if (!aligned) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "times must align to 1-hour grain (UTC, on the hour)",
      path: ["startAt"],
    });
  }
}

export const holdSlotInputSchema = z
  .object({
    playerId: uuidSchema,
    courtId: uuidSchema,
    startAt: z.date(),
    endAt: z.date(),
  })
  .superRefine(validateSlotTimes);
export type HoldSlotInput = z.infer<typeof holdSlotInputSchema>;

export const releaseHoldInputSchema = z.object({
  holdId: uuidSchema,
  playerId: uuidSchema,
});
export type ReleaseHoldInput = z.infer<typeof releaseHoldInputSchema>;

export const createBookingInputSchema = z
  .object({
    playerId: uuidSchema,
    courtId: uuidSchema,
    startAt: z.date(),
    endAt: z.date(),
    holdId: uuidSchema.optional(),
    notes: z.string().max(500).optional(),
    /** Optional voucher code applied to the booking fee. */
    voucherCode: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    /**
     * Optional per-booking notification email override. When provided, all
     * player-facing emails for this booking are sent here instead of the
     * account's profiles.email. The account email itself is unchanged.
     */
    contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    /**
     * Payment mode chosen by the player. `full` is the legacy behaviour:
     * the player transfers the entire total via GCash. `deposit` requires
     * the venue to have opted in (venues.allow_partial_payment); the player
     * transfers `venues.deposit_percent` of the total now and settles the
     * balance at the venue on arrival. The service re-validates against the
     * venue's setting and rejects mismatches.
     */
    paymentMode: z.enum(["full", "deposit"]).default("full"),
  })
  .superRefine(validateSlotTimes);
export type CreateBookingInput = z.input<typeof createBookingInputSchema>;

export const submitPaymentInputSchema = z.object({
  bookingId: uuidSchema,
  playerId: uuidSchema,
  receiptImagePath: z.string().min(1).max(500),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/, "must be a sha256 hex digest"),
  amountCentavos: positiveBigInt,
  gcashReferenceNumber: z.string().min(6).max(20),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentInputSchema>;

export const verifyPaymentInputSchema = z.object({
  paymentId: uuidSchema,
  verifierId: uuidSchema,
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentInputSchema>;

export const rejectPaymentInputSchema = z.object({
  paymentId: uuidSchema,
  verifierId: uuidSchema,
  reason: z.string().min(3).max(500),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentInputSchema>;

export const cancelBookingInputSchema = z.object({
  bookingId: uuidSchema,
  playerId: uuidSchema,
});
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;

// ----------------------------------------------------------------------------
// Owner-initiated cancel + reschedule (Tier 4)
// ----------------------------------------------------------------------------

export const cancellationCategorySchema = z.enum([
  "weather",
  "court_unavailable",
  "venue_closure",
  "player_request",
  "admin_action",
  "other",
]);
export type CancellationCategory = z.infer<typeof cancellationCategorySchema>;

export const ownerCancelBookingInputSchema = z.object({
  bookingId: uuidSchema,
  ownerId: uuidSchema,
  expectedVersion: z.number().int().positive(),
  category: cancellationCategorySchema,
  reason: z.string().min(3).max(500),
});
export type OwnerCancelBookingInput = z.infer<typeof ownerCancelBookingInputSchema>;

export const ownerRescheduleBookingInputSchema = z
  .object({
    bookingId: uuidSchema,
    ownerId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    newStartAt: z.date(),
    newEndAt: z.date(),
    /**
     * Optional: move to a different court in the same venue.
     * When provided and different from the current courtId, the service
     * verifies the new court is active, belongs to the same venue, and
     * recalculates courtFeeCentavos based on the new hourly rate.
     */
    newCourtId: uuidSchema.optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((d, ctx) =>
    validateSlotTimes({ startAt: d.newStartAt, endAt: d.newEndAt }, ctx),
  );
export type OwnerRescheduleBookingInput = z.infer<typeof ownerRescheduleBookingInputSchema>;

// ---------------------------------------------------------------------------
// Tier 6 — bulk venue/court closure
// ---------------------------------------------------------------------------

/**
 * Input for the preview query + the actual bulk-closure.
 * `courtIds` — one or more active courts at the owner's venue.
 * `fromAt` / `untilAt` — interval (overlap semantics: booking.startAt < untilAt AND booking.endAt > fromAt).
 */
export const closureRangeInputSchema = z.object({
  venueId: uuidSchema,
  ownerId: uuidSchema,
  /** One or more court IDs. Must all belong to venueId (verified in service). */
  courtIds: z.array(uuidSchema).min(1, "Select at least one court"),
  fromAt: z.date(),
  untilAt: z.date(),
  category: cancellationCategorySchema,
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
  /**
   * If true, attempt to move each affected booking to any other active court
   * at the same venue at the same start/end before cancelling. Falls back to
   * the cancel + email-rebook-link path on a per-booking basis.
   */
  autoReschedule: z.boolean().default(false),
}).superRefine((d, ctx) => {
  if (d.untilAt.getTime() <= d.fromAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End of closure window must be after start",
      path: ["untilAt"],
    });
  }
});

export type ClosureRangeInput = z.infer<typeof closureRangeInputSchema>;

