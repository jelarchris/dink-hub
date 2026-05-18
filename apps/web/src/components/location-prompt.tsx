"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MapPin, X } from "lucide-react";

type Scope = "venues" | "open-play";

interface LocationPromptProps {
  scope: Scope;
  /** True when `?lat=` and `?lng=` are present and valid in the URL. */
  active: boolean;
}

const SCOPE_COPY: Record<Scope, string> = {
  venues: "See courts nearest you",
  "open-play": "See sessions nearest you",
};

const DISMISS_KEY = (s: Scope): string => `dinkhub-location-prompt:${s}:dismissed`;
const COORDS_KEY = "dinkhub-location:coords";
const COORDS_TTL_MS = 60 * 60 * 1000; // 1 hour — fresh enough not to ask again, stale enough to re-verify daily.

interface StoredCoords {
  lat: number;
  lng: number;
  at: number;
}

/**
 * Slim, single-line "Enable location" pill. Two states:
 *   1. Idle: invites the user; click → browser geolocation → URL `?lat&lng`.
 *   2. Active (coords in URL): compact "Sorted by distance" chip + Clear link.
 *
 * Dismissable per scope. Coords cached in sessionStorage for cross-page reuse
 * (so a user who enabled on /venues won't be re-prompted on /open-play).
 */
export function LocationPrompt({
  scope,
  active,
}: LocationPromptProps): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const autoAppliedRef = useRef(false);

  useEffect(() => {
    // One-shot mount detection so we can defer rendering until after hydration.
    // The setState here is intentional and runs exactly once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      setDismissed(Boolean(window.localStorage.getItem(DISMISS_KEY(scope))));
    } catch {
      // ignore
    }
  }, [scope]);

  // Auto-apply cached coords if user already enabled location on another page.
  useEffect(() => {
    if (!mounted || active || autoAppliedRef.current || dismissed) return;
    let stored: StoredCoords | null = null;
    try {
      const raw = window.sessionStorage.getItem(COORDS_KEY);
      if (raw) stored = JSON.parse(raw) as StoredCoords;
    } catch {
      return;
    }
    if (!stored || Date.now() - stored.at > COORDS_TTL_MS) return;
    autoAppliedRef.current = true;
    pushWithCoords(stored.lat, stored.lng);
    // pushWithCoords is stable closure over router/searchParams; deps below are sufficient.
  }, [mounted, active, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  function pushWithCoords(lat: number, lng: number): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lat", lat.toFixed(6));
    params.set("lng", lng.toFixed(6));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  function buildClearHref(): string {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lat");
    params.delete("lng");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function handleEnable(): void {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Location not supported on this device.");
      return;
    }
    setError(null);
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          window.sessionStorage.setItem(
            COORDS_KEY,
            JSON.stringify({ lat: latitude, lng: longitude, at: Date.now() } satisfies StoredCoords),
          );
        } catch {
          // ignore quota / privacy-mode failures — sorting still works for this page.
        }
        setRequesting(false);
        pushWithCoords(latitude, longitude);
      },
      (err) => {
        setRequesting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location blocked. Use search or city filter instead.");
        } else if (err.code === err.TIMEOUT) {
          setError("Took too long. Try again.");
        } else {
          setError("Couldn't get your location.");
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }

  function handleDismiss(): void {
    try {
      window.localStorage.setItem(DISMISS_KEY(scope), new Date().toISOString());
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  function handleClear(): void {
    try {
      window.sessionStorage.removeItem(COORDS_KEY);
    } catch {
      // ignore
    }
  }

  // Don't render anything until after mount — prevents flash of the prompt
  // for users who already dismissed (localStorage is unavailable during SSR).
  if (!mounted) return null;

  if (active) {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-50)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-700)] ring-1 ring-[var(--color-brand-200)]">
        <MapPin className="size-3.5" aria-hidden />
        <span>Sorted by distance from you</span>
        <Link
          href={buildClearHref()}
          onClick={handleClear}
          className="ml-1 rounded-full px-2 py-0.5 transition hover:bg-white/60 hover:text-[var(--color-brand-900,inherit)]"
        >
          Clear
        </Link>
      </div>
    );
  }

  if (dismissed) return null;

  const busy = requesting || pending;

  return (
    <div
      role="region"
      aria-label={`Enable location for nearest ${scope === "venues" ? "courts" : "sessions"}`}
      className="my-2 flex items-center gap-2 rounded-full border border-[var(--color-brand-200)] bg-gradient-to-r from-[var(--color-brand-50)] via-[var(--color-brand-50)] to-transparent px-2 py-1.5 sm:px-3"
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-500)] text-white shadow-sm"
      >
        <MapPin className="size-3.5" />
      </span>
      <p
        className={`min-w-0 flex-1 truncate text-xs font-medium sm:text-sm ${
          error ? "text-[var(--color-danger-600,#b91c1c)]" : "text-[var(--color-fg)]"
        }`}
      >
        {error ?? SCOPE_COPY[scope]}
      </p>
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-500)] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-600)] active:scale-95 disabled:opacity-70 sm:text-sm"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : null}
        <span>{busy ? "Locating…" : error ? "Retry" : "Enable"}</span>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-fg-subtle)] transition hover:bg-white/60 hover:text-[var(--color-fg)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
