"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort error boundary for failures in the root layout itself.
 *
 * Most errors are caught by the closer `(app)/error.tsx` (friendlier UI +
 * ChunkLoadError auto-reload). This boundary only runs when something throws
 * inside the root `layout.tsx` or its providers — rare, but must render its
 * own `<html><body>` since the root layout has failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "global" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#faf8f4",
          color: "#1a1a1a",
        }}
      >
        <main
          style={{
            maxWidth: "28rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            DinkHub is having trouble loading
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#666", margin: 0 }}>
            Please try again. If the problem keeps happening, refresh the page
            or come back in a moment.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#999", margin: 0 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#0f5132",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Root layout has failed; next/link routing isn't safe here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: "white",
                color: "#1a1a1a",
                border: "1px solid #e5e1d8",
                borderRadius: "0.5rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
