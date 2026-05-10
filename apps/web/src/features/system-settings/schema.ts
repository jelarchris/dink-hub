import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalShortText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

// Empty string -> null (date input clears).
const optionalDate = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Use a YYYY-MM-DD date",
  );

const checkboxBool = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.undefined()])
  .transform((v) => v === "on" || v === "true" || v === "1");

const phpAmountSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^\d+(\.\d{1,2})?$/, "Use a number like 20 or 20.50")
  .refine((s) => Number(s) >= 0, "Must be zero or more")
  .refine((s) => Number(s) <= 10_000, "Looks too high (max ₱10,000)");

export const updateSystemSettingsSchema = z.object({
  promoActive: checkboxBool,
  promoShowOnHome: checkboxBool,
  promoShowOnBooking: checkboxBool,
  promoHeadline: z.string().trim().min(3, "Required").max(120),
  promoDescription: z.string().trim().min(3, "Required").max(280),
  promoUntilDate: optionalDate,
  baseBookingFeePhp: phpAmountSchema,
  invoiceDueDays: z.coerce.number().int().min(1).max(60),
  dinkhubGcashAccountName: optionalShortText,
  dinkhubGcashAccountNumber: optionalShortText,
  notes: optionalText,
});
export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;

export function phpStringToCentavos(decimal: string): bigint {
  const [whole = "0", frac = ""] = decimal.split(".");
  const padded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(padded);
}
