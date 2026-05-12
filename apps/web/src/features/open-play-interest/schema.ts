import { z } from "zod";

/**
 * Public input from the homepage teaser form. Email is the only required
 * field; honeypot must be empty (bots fill it). Source is constrained to a
 * small set so analytics buckets stay clean.
 */
export const registerInterestInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  source: z.enum(["home_teaser"]).default("home_teaser"),
  /** Honeypot — must be empty. */
  website: z.string().max(0).optional().default(""),
});

export type RegisterInterestInput = z.input<typeof registerInterestInput>;
export type RegisterInterestParsed = z.output<typeof registerInterestInput>;
