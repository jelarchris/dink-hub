"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

/**
 * Tracks SPA-style page-view events on every route change. Must be inside
 * Suspense because useSearchParams() suspends during SSR.
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!ph) return;
    // Build the full URL for the $current_url property.
    const url =
      window.location.origin +
      pathname +
      (searchParams.toString() ? `?${searchParams.toString()}` : "");
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

/**
 * PostHog analytics provider. No-ops when NEXT_PUBLIC_POSTHOG_KEY is unset
 * (local dev, CI). Initialised client-side only to avoid SSR errors.
 *
 * Config notes:
 * - `capture_pageview: false` — we fire $pageview manually in PageviewTracker
 *   so SPA navigations are tracked correctly (Next.js App Router navigates
 *   client-side without a full page reload).
 * - `capture_pageleave: true` — required for accurate session duration.
 * - `person_profiles: "identified_only"` — no anonymous profiles created
 *   for unidentified visitors (reduces MAU billing).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
