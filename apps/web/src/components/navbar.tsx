"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

export interface NavbarProps {
  user: { email: string; displayName: string; role: "player" | "venue_owner" | "admin" } | null;
}

/**
 * Scroll-aware nav: visible at the top of the page, hides on scroll-down,
 * reveals on scroll-up. The promo banner above it scrolls away naturally.
 *
 * Implementation notes:
 *   - rAF-throttled scroll listener avoids running React state updates on every
 *     scroll event (60+ Hz); we coalesce into one update per frame.
 *   - SHOW_THRESHOLD prevents the nav from flickering on tiny scroll jitters
 *     (e.g. iOS rubber-band, trackpad inertia).
 *   - HIDE_AFTER ensures the nav stays visible across the promo banner area;
 *     it can only hide once the user has scrolled past that height.
 *   - `passive: true` on the listener so we never block scroll on slow devices.
 */
const SHOW_THRESHOLD = 6; // px of upward delta before showing
const HIDE_THRESHOLD = 8; // px of downward delta before hiding
const HIDE_AFTER = 80;    // don't hide while still near the top of the page

export function Navbar({ user }: NavbarProps) {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    function onScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastYRef.current;
        if (y < HIDE_AFTER) {
          // Always visible near the top.
          setHidden(false);
        } else if (delta > HIDE_THRESHOLD) {
          setHidden(true);
        } else if (delta < -SHOW_THRESHOLD) {
          setHidden(false);
        }
        lastYRef.current = y;
        tickingRef.current = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-[var(--color-border-default)] bg-[var(--color-bg)]/80 backdrop-blur transition-transform duration-200 ease-out supports-[backdrop-filter]:bg-[var(--color-bg)]/60",
        hidden && "-translate-y-full",
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-500)] text-white"
            >
              D
            </span>
            <span className="text-lg">DinkHub</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <Link href="/venues" className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
              Find courts
            </Link>
            {user?.role === "venue_owner" && (
              <Link href="/owner" className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Owner dashboard
              </Link>
            )}
            {user?.role === "admin" && (
              <Link href="/admin" className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                Admin
              </Link>
            )}
            {user && (
              <Link href="/me/bookings" className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                My bookings
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-[var(--color-fg-muted)] sm:inline">
                  {user.displayName}
                </span>
                <form action={signOutAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
