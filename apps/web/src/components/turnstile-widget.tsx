"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile widget. Renders the official api.js script and a
 * managed challenge container. On success Cloudflare injects a hidden
 * `cf-turnstile-response` input into the surrounding <form>, which the
 * server action reads and verifies via siteverify.
 *
 * Renders nothing when no site key is configured (local dev without
 * Cloudflare). Server actions handle the missing-token case gracefully in
 * non-production environments.
 */
export function TurnstileWidget({
  siteKey,
  action,
  className,
}: {
  siteKey: string | null | undefined;
  action?: string;
  className?: string;
}) {
  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />
      <div
        className={`cf-turnstile ${className ?? ""}`.trim()}
        data-sitekey={siteKey}
        {...(action ? { "data-action": action } : {})}
      />
    </>
  );
}
