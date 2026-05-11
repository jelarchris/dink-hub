import { z } from "zod";

/**
 * Zod schemas for every public service input. The runtime boundary contract.
 * Time validation rules:
 *   - 30-minute grain (also enforced by DB CHECK constraint)
 *   - duration: 30 min <= d <= 4 h
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
  if (minutes < 30 || minutes > 240) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "duration must be between 30 minutes and 4 hours",
      path: ["endAt"],
    });
  }
  const aligned =
    d.startAt.getUTCSeconds() === 0 &&
    d.startAt.getUTCMilliseconds() === 0 &&
    d.startAt.getUTCMinutes() % 30 === 0 &&
    d.endAt.getUTCSeconds() === 0 &&
    d.endAt.getUTCMilliseconds() === 0 &&
    d.endAt.getUTCMinutes() % 30 === 0;
  if (!aligned) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "times must align to 30-minute grain (UTC)",
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
  })
  .superRefine(validateSlotTimes);
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

export const submitPaymentInputSchema = z.object({
  bookingId: uuidSchema,
  playerId: uuidSchema,
  receiptImagePath: z.string().min(1).max(500),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/, "must be a sha256 hex digest"),
  amountCentavos: positiveBigInt,
  gcashReferenceNumber: z.string().min(6).max(20).optional(),
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

