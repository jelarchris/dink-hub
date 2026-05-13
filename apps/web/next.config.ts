import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Security headers applied to every response. CSP is intentionally omitted
// here — Next.js injects inline runtime scripts and a nonce-based CSP needs
// dedicated middleware. The headers below provide the high-impact OWASP
// defenses with no risk of breaking the app.
const securityHeaders = [
  // Force HTTPS for 2 years, including subdomains. Browsers ignore on http
  // and on localhost, so this is safe to ship in all environments.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Prevent MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt-and-suspenders clickjacking defense alongside frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't leak full URLs to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful browser features we don't use. Geolocation may be added
  // later for venue-distance UX; relax then.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
  // Allow DNS prefetch for performance (Supabase, Sentry, Turnstile).
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Cross-origin isolation defaults that don't break embeds we use.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      {
        // Apply to every route, including API responses.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
      webpack: { treeshake: { removeDebugLogging: true } },
    })
  : nextConfig;
