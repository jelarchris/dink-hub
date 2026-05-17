import { z } from "zod";

const uuid = z.string().uuid();

const codeSchema = z
  .string()
  .trim()
  .min(3, "Code must be at least 3 characters")
  .max(40, "Code is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, underscore or hyphen only");

export const validateVoucherInputSchema = z.object({
  code: codeSchema,
  userId: uuid,
  courtFeeCentavos: z.bigint().nonnegative(),
  baseSystemFeeCentavos: z.bigint().nonnegative(),
});
export type ValidateVoucherInput = z.infer<typeof validateVoucherInputSchema>;

export const createVoucherInputSchema = z
  .object({
    code: codeSchema,
    discountType: z.enum(["percent", "flat"]),
    /** percent: 1..100, flat: PHP pesos converted to centavos (allow 2 decimals). */
    discountValue: z.string().trim().min(1, "Required"),
    maxRedemptions: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : null)),
    maxPerUser: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : "1")),
    minCourtFeePhp: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : "0")),
    /** YYYY-MM-DD or empty. */
    validUntilDate: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s && s.length > 0 ? s : null)),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((s) => (s && s.length > 0 ? s : null)),
  })
  .superRefine((data, ctx) => {
    const value = Number(data.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Must be a positive number",
      });
      return;
    }
    if (data.discountType === "percent" && (value < 1 || value > 100 || !Number.isInteger(value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percent must be a whole number between 1 and 100",
      });
    }
    if (data.maxRedemptions !== null) {
      const n = Number(data.maxRedemptions);
      if (!Number.isInteger(n) || n < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxRedemptions"],
          message: "Must be a whole number ≥ 1, or blank for unlimited",
        });
      }
    }
    const perUser = Number(data.maxPerUser);
    if (!Number.isInteger(perUser) || perUser < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPerUser"],
        message: "Must be 0 (unlimited) or a positive whole number",
      });
    }
    if (data.validUntilDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.validUntilDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["validUntilDate"],
          message: "Use YYYY-MM-DD",
        });
      }
    }
  });
export type CreateVoucherInput = z.infer<typeof createVoucherInputSchema>;

export const updateVoucherStatusSchema = z.object({
  voucherId: uuid,
  status: z.enum(["active", "paused", "expired"]),
});
export type UpdateVoucherStatusInput = z.infer<typeof updateVoucherStatusSchema>;

/**
 * Convert a Pesos string like "1.50" or "12" to centavos as bigint.
 * Rejects anything with > 2 decimal places.
 */
export function phpToCentavos(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Invalid peso amount");
  }
  const [pesos, decimals = ""] = trimmed.split(".");
  const paddedDecimals = decimals.padEnd(2, "0");
  return BigInt(pesos!) * 100n + BigInt(paddedDecimals);
}
