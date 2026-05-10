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
 * In non-production environments where TURNSTILE_SECRET_KEY is unset, this
 * returns success=true with skipped=true so local dev and tests don't need
 * Cloudflare credentials. In production an unset secret fails closed.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string | null | undefined,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (env.NODE_ENV === "production") {
      return { success: false, skipped: false, reason: "secret_not_configured" };
    }
    return { success: true, skipped: true };
  }

  if (!token || token.length < 10) {
    return { success: false, skipped: false, reason: "missing_token" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  let resp: Response;
  try {
    resp = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      // Keep this fast — siteverify is on the hot signin path.
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error("[turnstile] siteverify fetch failed", err);
    return { success: false, skipped: false, reason: "fetch_failed" };
  }

  if (!resp.ok) {
    return { success: false, skipped: false, reason: `siteverify_${resp.status}` };
  }

  const json = (await resp.json()) as {
    success: boolean;
    "error-codes"?: string[];
  };

  const errorCodes = json["error-codes"];
  if (errorCodes && errorCodes.length > 0) {
    if (json.success !== true) {
      console.error("[turnstile] siteverify rejected", { errorCodes });
    }
    return { success: json.success === true, skipped: false, reason: errorCodes.join(",") };
  }
  if (json.success !== true) {
    console.error("[turnstile] siteverify success=false with no error codes");
  }
  return { success: json.success === true, skipped: false };
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
