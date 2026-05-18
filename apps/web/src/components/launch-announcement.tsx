"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * One-time launch announcement modal.
 *
 * Bump the storage key (and copy below) for the next announcement — that way
 * users who dismissed a previous one will still see new ones.
 */
const STORAGE_KEY = "dinkhub-announce:open-play-launch-v1";
const SHOW_DELAY_MS = 1800;

/** Don't interrupt task-focused or already-relevant flows. */
const SUPPRESS_PREFIXES = [
  "/open-play",
  "/owner",
  "/admin",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
];

/** Picked from our design tokens so it stays on-brand in light + dark. */
const CONFETTI_COLORS = [
  "var(--color-brand-500)",
  "var(--color-brand-300)",
  "var(--color-accent-500)",
  "var(--color-warning-300)",
  "var(--color-info-500)",
] as const;

interface ConfettiPiece {
  id: number;
  cx: number; // horizontal drift in px
  cy: number; // vertical drift in px (negative = up)
  cr: number; // rotation in deg
  delay: number; // ms
  color: string;
}

function buildConfetti(): ConfettiPiece[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: i,
    cx: (Math.random() - 0.5) * 280,
    cy: -120 - Math.random() * 160,
    cr: (Math.random() - 0.5) * 720,
    delay: Math.random() * 140,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? CONFETTI_COLORS[0],
  }));
}

export function LaunchAnnouncement(): React.ReactElement | null {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  const suppressed = useMemo(() => {
    if (!pathname) return true;
    return SUPPRESS_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }, [pathname]);

  // Open after a short delay if eligible and not previously dismissed.
  useEffect(() => {
    if (suppressed) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // SSR / privacy mode: don't pester.
      return;
    }
    const t = window.setTimeout(() => {
      setConfetti(buildConfetti());
      setOpen(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [suppressed]);

  // While open: ESC to close, body-scroll lock, focus primary CTA.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusT = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-autofocus]")
        ?.focus();
    }, 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusT);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
      aria-describedby="launch-desc"
      onClick={dismiss}
      className="launch-backdrop-in fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="launch-modal-in relative w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg)] shadow-xl ring-1 ring-[var(--color-border-default)]"
      >
        {/* Confetti layer — purely decorative */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 z-10 h-0">
          {confetti.map((c) => (
            <span
              key={c.id}
              className="launch-confetti"
              style={
                {
                  backgroundColor: c.color,
                  animationDelay: `${c.delay}ms`,
                  "--cx": `${c.cx}px`,
                  "--cy": `${c.cy}px`,
                  "--cr": `${c.cr}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close announcement"
          className="absolute right-3 top-3 z-20 inline-flex size-8 items-center justify-center rounded-full text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]"
        >
          <X className="size-4" />
        </button>

        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--color-brand-50)] via-[var(--color-bg)] to-[var(--color-brand-100)] px-6 pb-7 pt-9 text-center">
          {/* Court-line decoration */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-500)]/40 to-transparent"
          />

          {/* LIVE badge */}
          <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-danger-500)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            <span className="launch-live-pulse inline-block size-1.5 rounded-full bg-white" />
            Live
          </div>

          {/* Paddle + bouncing ball */}
          <PickleballHero />

          <h2
            id="launch-title"
            className="mt-4 text-2xl font-bold tracking-tight text-[var(--color-fg)] sm:text-3xl"
          >
            Open Play is{" "}
            <span className="text-[var(--color-brand-600)]">LIVE</span>
            <span aria-hidden className="ml-1">🎾</span>
          </h2>
          <p
            id="launch-desc"
            className="mx-auto mt-2 max-w-xs text-sm text-[var(--color-fg-muted)]"
          >
            Drop into a session near you. Reserve your spot, pay once, show up
            and play — no group chat herding required.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row-reverse">
          <Link
            data-autofocus
            href="/open-play"
            onClick={dismiss}
            className={cn(buttonVariants({ size: "md" }), "w-full sm:flex-1")}
          >
            See live sessions
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className={cn(
              buttonVariants({ variant: "ghost", size: "md" }),
              "w-full sm:flex-1",
            )}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

/** Paddle (swinging) + pickleball (bouncing) with a soft shadow. */
function PickleballHero(): React.ReactElement {
  return (
    <div className="relative mx-auto flex size-28 items-end justify-center">
      {/* Paddle — sits behind, gently swings */}
      <svg
        aria-hidden
        viewBox="0 0 64 64"
        className="launch-paddle-swing absolute inset-0 size-full opacity-90"
      >
        {/* handle */}
        <rect x="29" y="38" width="6" height="22" rx="2" fill="#5b4636" />
        <rect x="28" y="44" width="8" height="3" fill="#3f2f23" opacity="0.6" />
        {/* paddle face */}
        <ellipse cx="32" cy="26" rx="18" ry="20" fill="var(--color-brand-600)" />
        <ellipse cx="32" cy="26" rx="14.5" ry="16.5" fill="var(--color-brand-500)" />
        <ellipse
          cx="27"
          cy="20"
          rx="4"
          ry="6"
          fill="white"
          opacity="0.18"
        />
      </svg>

      {/* Ball shadow */}
      <span
        aria-hidden
        className="launch-ball-shadow absolute bottom-1 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/40 blur-[2px]"
      />

      {/* Pickleball — bouncing */}
      <svg
        aria-hidden
        viewBox="0 0 32 32"
        className="launch-ball-bounce relative size-12 drop-shadow-md"
      >
        <defs>
          <radialGradient id="pb-grad" cx="35%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="55%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill="url(#pb-grad)" />
        {/* holes */}
        <circle cx="11" cy="11" r="1.4" fill="#a16207" opacity="0.65" />
        <circle cx="19" cy="9.5" r="1.2" fill="#a16207" opacity="0.65" />
        <circle cx="22.5" cy="16" r="1.4" fill="#a16207" opacity="0.65" />
        <circle cx="17" cy="20" r="1.3" fill="#a16207" opacity="0.65" />
        <circle cx="10" cy="18.5" r="1.2" fill="#a16207" opacity="0.65" />
        {/* highlight */}
        <ellipse cx="11" cy="9" rx="3" ry="1.6" fill="white" opacity="0.55" />
      </svg>
    </div>
  );
}
