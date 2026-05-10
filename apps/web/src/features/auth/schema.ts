import { z } from "zod";

export const signUpInputSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(60, "Name must be 60 characters or less"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be 72 characters or less")
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
        message: "Use letters and at least one number",
      }),
    role: z.enum(["player", "venue_owner"]).default("player"),
  })
  .strict();
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: z.string().min(1, "Password required"),
  })
  .strict();
export type SignInInput = z.infer<typeof signInInputSchema>;

export const requestPasswordResetInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  })
  .strict();
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

export const updatePasswordInputSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be 72 characters or less")
      .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
        message: "Use letters and at least one number",
      }),
  })
  .strict();
export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;
