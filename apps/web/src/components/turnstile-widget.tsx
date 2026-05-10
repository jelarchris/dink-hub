"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          action?: string;
          theme?: "auto" | "light" | "dark";
          appearance?: "always" | "execute" | "interaction-only";
          retry?: "auto" | "never";
          "refresh-expired"?: "auto" | "manual" | "never";
          "error-callback"?: (code: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
      ready: (cb: () => void) => void;
    };
    onTurnstileReady?: () => void;
  }
}

/**
 * Cloudflare Turnstile widget. Explicit-render variant: we own the lifecycle
 * via window.turnstile.render so React re-renders triggered by useActionState
 * (e.g. on validation failure) don't orphan the widget. On error/expiry we
 * reset so the next submit gets a fresh token. The hidden cf-turnstile-response
 * input is still injected into the surrounding <form> by Cloudflare.
 *
 * Tokens are single-use AND expire after ~5 minutes. We reset on the form's
 * `submit` event so every attempt sends a fresh token (prevents the
 * `timeout-or-duplicate` siteverify rejection on retries).
 *
 * Returns null when no site key is configured (local dev). Server actions
 * handle the missing-token case in non-production environments.
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const key = siteKey;
    let cancelled = false;

    function mount() {
      if (cancelled) return;
      const ts = window.turnstile;
      const el = containerRef.current;
      if (!ts || !el) return;
      if (widgetIdRef.current) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {
          // widget may already be gone
        }
        widgetIdRef.current = null;
      }
      widgetIdRef.current = ts.render(el, {
        sitekey: key,
        ...(action ? { action } : {}),
        theme: "auto",
        retry: "auto",
        "refresh-expired": "auto",
        "error-callback": () => {
          if (widgetIdRef.current) {
            try {
              window.turnstile?.reset(widgetIdRef.current);
            } catch {
              // ignore
            }
          }
        },
        "expired-callback": () => {
          if (widgetIdRef.current) {
            try {
              window.turnstile?.reset(widgetIdRef.current);
            } catch {
              // ignore
            }
          }
        },
      });
    }

    if (window.turnstile) {
      mount();
    } else {
      window.onTurnstileReady = mount;
    }

    // Reset the widget AFTER the surrounding form submits so the next attempt
    // gets a fresh token. We attach to the closest form element. Single-use
    // tokens otherwise cause "timeout-or-duplicate" on the second click.
    const container = containerRef.current;
    const form = container?.closest("form") ?? null;
    function handleSubmit() {
      // Defer until after the current submission is dispatched so the in-flight
      // FormData still carries the current (valid) token.
      setTimeout(() => {
        const id = widgetIdRef.current;
        if (id) {
          try {
            window.turnstile?.reset(id);
          } catch {
            // ignore
          }
        }
      }, 0);
    }
    if (form) form.addEventListener("submit", handleSubmit);

    return () => {
      cancelled = true;
      if (form) form.removeEventListener("submit", handleSubmit);
      const id = widgetIdRef.current;
      if (id) {
        try {
          window.turnstile?.remove(id);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady&render=explicit"
        strategy="afterInteractive"
      />
      <div ref={containerRef} className={className} />
    </>
  );
}
