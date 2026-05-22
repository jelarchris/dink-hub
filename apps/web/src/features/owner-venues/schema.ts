import { z } from "zod";

/**
 * Money inputs come in as PHP decimal strings (e.g. "150" or "150.50") from
 * <input type="number" step="0.01">. We convert to bigint centavos at the
 * service boundary.
 */
const phpAmountSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^\d+(\.\d{1,2})?$/, "Use a number like 150 or 150.50")
  .refine((s) => Number(s) >= 0, "Must be zero or more")
  .refine((s) => Number(s) <= 1_000_000, "Looks too high");

export const venueUpsertSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120, "Name is too long"),
  description: z
    .string()
    .trim()
    .max(2_000, "Keep it under 2,000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  addressLine: z.string().trim().min(4, "Address is required").max(240),
  city: z.string().trim().min(2, "City is required").max(80),
  province: z.string().trim().min(2, "Province is required").max(80),
  postalCode: z
    .string()
    .trim()
    .max(16)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  latitude: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || (!Number.isNaN(Number(v)) && Math.abs(Number(v)) <= 90), {
      message: "Latitude must be between -90 and 90",
    }),
  longitude: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || (!Number.isNaN(Number(v)) && Math.abs(Number(v)) <= 180), {
      message: "Longitude must be between -180 and 180",
    }),
  gcashAccountName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  gcashAccountNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || /^[0-9+\-\s()]{6,40}$/.test(v), {
      message: "Use digits and basic punctuation only",
    }),
  coverImagePath: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  gcashQrImagePath: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type VenueUpsertInput = z.infer<typeof venueUpsertSchema>;

export const venueStatusActionSchema = z.enum(["save_draft", "submit_for_review"]);
export type VenueStatusAction = z.infer<typeof venueStatusActionSchema>;

export const courtSurfaceValues = [
  "hard",
  "cushioned",
  "wood",
  "outdoor_sport",
  "other",
] as const;

export const courtUpsertSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Keep the court name under 60 characters"),
  surface: z.enum(courtSurfaceValues),
  isIndoor: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
  hourlyRatePhp: phpAmountSchema,
  openHour: z.coerce.number().int().min(0).max(23).default(6),
  closeHour: z.coerce.number().int().min(1).max(24).default(22),
  imagePath: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
}).refine((v) => v.openHour < v.closeHour, {
  message: "Closing hour must be later than opening hour",
  path: ["closeHour"],
});

export type CourtUpsertInput = z.infer<typeof courtUpsertSchema>;

export function phpStringToCentavos(decimal: string): bigint {
  // Already validated by phpAmountSchema; safe to split.
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return BigInt(whole ?? "0") * 100n + BigInt(fracPadded);
}

export function centavosToPhpString(centavos: bigint): string {
  const sign = centavos < 0n ? "-" : "";
  const abs = centavos < 0n ? -centavos : centavos;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${sign}${whole.toString()}.${frac}`;
}

// ----------------------------------------------------------------------------
// court closure schemas (Tier 9)
// ----------------------------------------------------------------------------

export const courtClosureSchema = z.object({
  courtId: z.string().uuid(),
  // ISO 8601 with offset (+08:00) — the form serialises Manila wall-clock time.
  startAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  endAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  reason: z
    .string()
    .trim()
    .max(500, "Reason is too long")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
}).refine((d) => d.endAt > d.startAt, {
  message: "End time must be after start time.",
  path: ["endAt"],
});

export type CourtClosureFormInput = z.infer<typeof courtClosureSchema>;

export const removeCourtClosureSchema = z.object({
  closureId: z.string().uuid(),
});
