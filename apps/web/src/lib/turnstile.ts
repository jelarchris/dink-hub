import "server-only";
import { env } from "./env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const FIELD_NAME = "cf-turnstile-response" as const;

export const TURNSTILE_FIELD_NAME = FIELD_NAME;

export interface TurnstileResult {
  /** True when the token verified OR verification was skipped (dev only). */
  success: boolean;
  /** True when no secret is configured AND we are not in production. */
  skipped: boolean;
  /** Coarse failure reason for logging. Never surface to end users. */
  reason?: string;
}

/**
 * Verify a Cloudflare Turnstile token against siteverify.
 *
 * CAPTCHA is currently DISABLED for the small private launch — the user base
 * is invitation-only (~100 people) so bot signup is not a realistic threat.
 * To re-enable: delete the early `return { success: true, skipped: true }`
 * below and put the Turnstile widgets back on auth forms.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string | null | undefined,
): Promise<TurnstileResult> {
  // Hard skip — captcha disabled in all environments. See JSDoc above.
  void token;
  void ip;
  void env;
  void VERIFY_URL;
  return { success: true, skipped: true };
}

/**
 * Extract the originating client IP from forwarding headers. Returns null when
 * we cannot determine it (e.g. local dev without a proxy). Never trust this
 * for authorization — it is provided by the edge and only useful as a hint
 * for rate limits and Turnstile siteverify.
 */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
