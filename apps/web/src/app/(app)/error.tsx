"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-level error boundary for the (app) segment.
 *
 * Handles two cases distinctly:
 *
 * 1. **ChunkLoadError / dynamic-import failures** — almost always caused by a
 *    Vercel deploy that replaced the JS chunks the user's already-loaded HTML
 *    references. Self-heals with one hard reload; the user sees a brief
 *    "Updating to the latest version…" instead of a scary error.
 *
 * 2. **Real runtime errors** — render a friendly recovery panel with Reload /
 *    Home actions and pipe the error to Sentry with its `digest` attached so
 *    we can correlate the client report with the server-side trace.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const isChunkError = isChunkLoadError(error);

  useEffect(() => {
    if (isChunkError) {
      // One-shot hard reload. Guarded so we don't loop if the reload itself
      // hits a deploy-in-progress 500.
      const key = "dinkhub:chunk-reload-attempted";
      if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      return;
    }
    Sentry.captureException(error, {
      tags: { boundary: "app-segment" },
      extra: { digest: error.digest },
    });
  }, [error, isChunkError]);

  // While the reload kicks in, show a calm message rather than the error UI.
  if (isChunkError) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="size-10 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-brand-600)]" />
        <p className="text-sm text-[var(--color-fg-muted)]">
          Updating to the latest version…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <div className="size-12 rounded-full bg-[var(--color-danger-600)]/10 p-3 text-[var(--color-danger-600)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-fg)]">
        Something went wrong
      </h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        We hit an unexpected error. The team has been notified — please try again.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--color-fg-subtle)]">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-700)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg-subtle)]"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}

function isChunkLoadError(error: Error): boolean {
  // Next.js / webpack chunk failures surface under several names depending on
  // browser + how the failure happened (network 404, parse, integrity, etc).
  const name = error.name ?? "";
  const message = error.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Loading CSS chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}
