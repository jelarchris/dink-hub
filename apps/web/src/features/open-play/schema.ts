import { z } from "zod";

/**
 * Zod schemas for the open-play service inputs. Each public service function
 * has a corresponding `*InputSchema` — validates at the boundary so the service
 * body can rely on parsed types.
 *
 * Time validation mirrors bookings: 30-min grain UTC, 30 min ≤ duration ≤ 4 h.
 */

const uuidSchema = z.string().uuid();

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

export const skillLevelSchema = z.enum(["any", "beginner", "intermediate", "advanced"]);
export type SkillLevelInput = z.infer<typeof skillLevelSchema>;

const titleSchema = z.string().trim().min(2, "Title must be at least 2 characters").max(120);
const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description must be 2000 characters or fewer")
  .optional()
  .or(z.literal("").transform(() => undefined));
const capacitySchema = z
  .number()
  .int()
  .min(2, "Capacity must be at least 2")
  .max(32, "Capacity must be 32 or fewer");
const priceSchema = z.bigint().nonnegative();

export const createSessionInputSchema = z
  .object({
    ownerId: uuidSchema,
    venueId: uuidSchema,
    courtId: uuidSchema,
    title: titleSchema,
    description: descriptionSchema,
    skillLevel: skillLevelSchema.default("any"),
    capacity: capacitySchema,
    pricePerPlayerCentavos: priceSchema,
    startAt: z.date(),
    endAt: z.date(),
  })
  .superRefine(validateSlotTimes);
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;

export const updateSessionInputSchema = z
  .object({
    ownerId: uuidSchema,
    sessionId: uuidSchema,
    title: titleSchema.optional(),
    description: descriptionSchema,
    skillLevel: skillLevelSchema.optional(),
    capacity: capacitySchema.optional(),
    pricePerPlayerCentavos: priceSchema.optional(),
  });
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

export const publishSessionInputSchema = z.object({
  ownerId: uuidSchema,
  sessionId: uuidSchema,
});
export type PublishSessionInput = z.infer<typeof publishSessionInputSchema>;

export const cancelSessionInputSchema = z.object({
  ownerId: uuidSchema,
  sessionId: uuidSchema,
  reason: z.string().trim().min(3).max(500).optional(),
});
export type CancelSessionInput = z.infer<typeof cancelSessionInputSchema>;

export const joinSessionInputSchema = z.object({
  playerId: uuidSchema,
  sessionId: uuidSchema,
  contactEmail: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type JoinSessionInput = z.infer<typeof joinSessionInputSchema>;

export const cancelSignupInputSchema = z.object({
  playerId: uuidSchema,
  signupId: uuidSchema,
});
export type CancelSignupInput = z.infer<typeof cancelSignupInputSchema>;

export const submitSignupPaymentInputSchema = z.object({
  signupId: uuidSchema,
  playerId: uuidSchema,
  receiptImagePath: z.string().min(1),
  receiptHash: z.string().min(1),
  amountCentavos: z.bigint().positive(),
  gcashReferenceNumber: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type SubmitSignupPaymentInput = z.infer<typeof submitSignupPaymentInputSchema>;

export const verifySignupPaymentInputSchema = z.object({
  paymentId: uuidSchema,
  verifierId: uuidSchema,
});
export type VerifySignupPaymentInput = z.infer<typeof verifySignupPaymentInputSchema>;

export const rejectSignupPaymentInputSchema = z.object({
  paymentId: uuidSchema,
  verifierId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});
export type RejectSignupPaymentInput = z.infer<typeof rejectSignupPaymentInputSchema>;
