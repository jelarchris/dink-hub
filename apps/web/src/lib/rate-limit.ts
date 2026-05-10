import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * Sliding-window rate limiters backed by Upstash Redis.
 *
 * If UPSTASH_REDIS_REST_URL/TOKEN are not set, every limiter no-ops and
 * `checkRateLimit` returns allowed=true with skipped=true. This keeps local
 * dev and CI working without any external dependency. Production deployments
 * MUST set both env vars.
 */

const url = env.UPSTASH_REDIS_REST_URL;
const token = env.UPSTASH_REDIS_REST_TOKEN;
const enabled = Boolean(url && token);

const redis = enabled
  ? new Redis({ url: url as string, token: token as string })
  : null;

if (!enabled && env.NODE_ENV === "production") {
  // We choose to log loudly rather than throw — service still functional,
  // just unprotected. Surface this in dashboards.
  console.warn(
    "[rate-limit] Upstash credentials missing in production — rate limiting disabled.",
  );
}

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

function makeLimiter(prefix: string, requests: number, window: Window): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    prefix: `dh:rl:${prefix}`,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: false,
  });
}

/**
 * Per-surface limiters. Tuned for human users on a Filipino mobile network:
 * conservative enough to slow credential stuffing and booking spam while not
 * blocking honest retries.
 */
export const limiters = {
  /** Signup + signin attempts. Keyed by IP (no user yet). */
  auth: makeLimiter("auth", 5, "1 m"),
  /** Booking creation by an authenticated player. Keyed by user id. */
  bookingCreate: makeLimiter("booking", 10, "1 m"),
  /** Receipt upload by an authenticated player. Keyed by user id. */
  receiptUpload: makeLimiter("receipt", 5, "1 m"),
};

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  /** Unix epoch milliseconds when the window resets. */
  resetMs: number;
  /** True when rate limiting was bypassed because Upstash is not configured. */
  skipped: boolean;
}

/**
 * Check a limiter for the given identifier. Always returns — never throws.
 * Errors talking to Upstash fail OPEN (allowed=true, skipped=true) so a
 * Redis outage does not take the booking flow down.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitOutcome> {
  if (!limiter || !identifier) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, resetMs: 0, skipped: true };
  }
  try {
    const r = await limiter.limit(identifier);
    return { allowed: r.success, remaining: r.remaining, resetMs: r.reset, skipped: false };
  } catch (err) {
    console.error("[rate-limit] limiter.limit failed", err);
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, resetMs: 0, skipped: true };
  }
}

/**
 * Format a user-facing rate-limit message. Caller passes the resetMs from
 * the outcome. Returned string never reveals server internals.
 */
export function rateLimitMessage(resetMs: number): string {
  const seconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  if (seconds <= 60) return `Too many attempts — try again in ${seconds}s.`;
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
