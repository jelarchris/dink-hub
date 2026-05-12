"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

function resolvePostHogHosts(host: string): { apiHost: string; uiHost: string } {
  if (host === "https://us.posthog.com") {
    return { apiHost: "https://us.i.posthog.com", uiHost: host };
  }
  if (host === "https://eu.posthog.com") {
    return { apiHost: "https://eu.i.posthog.com", uiHost: host };
  }
  return { apiHost: host, uiHost: host };
}

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
    const { apiHost, uiHost } = resolvePostHogHosts(POSTHOG_HOST);
    posthog.init(POSTHOG_KEY, {
      api_host: apiHost,
      ui_host: uiHost,
      capture_pageview: false,
      capture_pageleave: true,
      advanced_disable_feature_flags: true,
      disable_external_dependency_loading: true,
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
