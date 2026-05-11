import { z } from "zod";

// E.164 Philippine mobile: +639XXXXXXXXX (13 chars total).
const phoneRegex = /^\+639\d{9}$/;

/** Strip whitespace, dashes, and parens — humans paste "+63 917-123 4567". */
function normalizePhone(value: string): string {
  return value.replace(/[\s\-()]/g, "");
}

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be 80 characters or less")
    .regex(/\S/, "Name cannot be blank"),
  phoneE164: z
    .string()
    .max(20)
    .transform(normalizePhone)
    .refine((v) => v === "" || phoneRegex.test(v), {
      message: "Enter a valid PH mobile: +639XXXXXXXXX",
    })
    .optional(),
  gender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
  city: z.string().max(80).optional(),
  notifEmailDailyDigest: z.boolean().optional(),
  notifEmailPaymentSubmitted: z.boolean().optional(),
  notifEmailBookingCancelled: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
