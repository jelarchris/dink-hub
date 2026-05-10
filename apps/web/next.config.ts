import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

const sentryEnabled = Boolean(process.env.SENTRY_DSN);

// Only wrap with Sentry when a DSN is configured. Without this guard the
// build-time wrapper still runs and warns on every local `next build`
// even though no events would ever be sent.
export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: !process.env.SENTRY_AUTH_TOKEN,
      ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
      ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
      disableLogger: true,
    })
  : nextConfig;
