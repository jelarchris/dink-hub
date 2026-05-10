import "server-only";
import * as Sentry from "@sentry/nextjs";
import { env } from "./env";

/**
 * Centralized error capture for server actions and cron routes.
 *
 * Why a wrapper instead of importing Sentry directly everywhere:
 *  - Single place to scrub PII / add common tags.
 *  - No-ops when SENTRY_DSN is unset (local dev, CI).
 *  - Always logs to stdout so we still see errors in `pnpm dev`.
 */

export interface ErrorContext {
  /** Logical area: e.g. "auth.signIn", "booking.create", "cron.expire". */
  scope: string;
  /** Authenticated user id, when known. Never include email or PII. */
  userId?: string;
  /** Free-form structured context. Avoid putting tokens/secrets here. */
  extra?: Record<string, unknown>;
}

export function captureException(err: unknown, ctx: ErrorContext): void {
  // Always log first so dev iteration doesn't depend on Sentry being up.
  console.error(`[${ctx.scope}]`, err, ctx.extra ?? {});

  if (!env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    scope.setTag("scope", ctx.scope);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.extra) scope.setContext("extra", ctx.extra);
    Sentry.captureException(err);
  });
}
