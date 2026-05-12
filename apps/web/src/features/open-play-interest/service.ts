import "server-only";
import { createHash } from "node:crypto";
import { captureException } from "@/lib/observability";
import { OpenPlayInterestError } from "./errors";
import { insertInterest } from "./repo";
import { registerInterestInput, type RegisterInterestInput } from "./schema";

export interface RegisterInterestContext {
  /** Raw client IP from request headers, or null if unknown. */
  ip: string | null;
  /** Market key. Defaults to launch market. */
  market?: string;
}

export interface RegisterInterestResult {
  /** True when this email was added; false if already registered for the market. */
  newSignup: boolean;
}

/**
 * Validate input and persist a new interest signup. Treats duplicates as
 * success (idempotent). Spam (honeypot filled) is silently treated as
 * success too — never reveal the trap to the bot.
 */
export async function registerInterest(
  raw: RegisterInterestInput,
  ctx: RegisterInterestContext,
): Promise<RegisterInterestResult> {
  const parsed = registerInterestInput.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    throw new OpenPlayInterestError(
      "validation_failed",
      "Please check the form and try again.",
      flat.fieldErrors as Record<string, string[]>,
    );
  }

  // Honeypot tripped — pretend success, don't write.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return { newSignup: false };
  }

  const market = ctx.market ?? "agusan_del_sur";
  const ipHash = ctx.ip ? createHash("sha256").update(ctx.ip).digest("hex") : null;

  try {
    const newSignup = await insertInterest({
      email: parsed.data.email,
      market,
      source: parsed.data.source,
      ...(ipHash ? { ipHash } : {}),
    });
    return { newSignup };
  } catch (err) {
    captureException(err, { scope: "open-play-interest.register" });
    throw new OpenPlayInterestError(
      "unknown",
      "Something went wrong. Please try again in a moment.",
    );
  }
}
