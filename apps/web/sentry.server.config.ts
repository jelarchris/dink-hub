import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    // Errors only — performance monitoring disabled to keep the free quota
    // useful for the launch market. Bump if/when we want traces.
    tracesSampleRate: 0,
    // Don't auto-attach stack traces for plain `console.error` — we already
    // explicitly call captureException in our service-action error paths.
    enableLogs: false,
    // Server-side: sanitize obvious secrets from logged URLs.
    sendDefaultPii: false,
  });
}
