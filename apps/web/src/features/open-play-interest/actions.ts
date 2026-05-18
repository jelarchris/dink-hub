"use server";

import { headers } from "next/headers";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { isOpenPlayInterestError } from "./errors";
import { registerInterest } from "./service";

export type OpenPlayInterestActionState =
  | { ok: true; alreadyRegistered: boolean }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> }
  | null;

function s(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Server action backing the homepage "Coming soon: Open Play" teaser form.
 * Per-IP rate-limited (5 / 10 min) + honeypot. No CAPTCHA — low-stakes form.
 * Always returns a result so React's useActionState can render feedback.
 */
export async function registerOpenPlayInterestAction(
  _prev: OpenPlayInterestActionState,
  form: FormData,
): Promise<NonNullable<OpenPlayInterestActionState>> {
  const h = await headers();
  const ip = getClientIp(h);

  const rl = await checkRateLimit(limiters.publicSignup, `open-play:${ip ?? "unknown"}`);
  if (!rl.allowed) {
    return { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) };
  }

  try {
    const result = await registerInterest(
      {
        email: s(form, "email"),
        source: "home_teaser",
        website: s(form, "website"),
      },
      { ip },
    );
    return { ok: true, alreadyRegistered: !result.newSignup };
  } catch (err) {
    if (isOpenPlayInterestError(err)) {
      const out: NonNullable<OpenPlayInterestActionState> = {
        ok: false,
        code: err.code,
        message: err.message,
      };
      if (err.fieldErrors !== undefined) {
        return { ...out, fieldErrors: err.fieldErrors };
      }
      return out;
    }
    return { ok: false, code: "unknown", message: "Something went wrong. Please try again." };
  }
}
