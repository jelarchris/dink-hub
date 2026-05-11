"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { signOutAction } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

export interface NavbarProps {
  user: { email: string; displayName: string; role: "player" | "venue_owner" | "admin" } | null;
}

/**
 * Scroll-aware nav: visible at the top, hides on scroll-down, reveals on scroll-up.
 * On mobile the horizontal nav links are replaced by a hamburger menu that
 * slides open a full-width panel below the header.
 *
 * rAF-throttled scroll listener coalesces updates to one per frame so React
 * state never updates at 60+ Hz. SHOW/HIDE thresholds prevent jitter from iOS
 * rubber-band and trackpad inertia. HIDE_AFTER keeps the nav visible while the
 * promo banner is still on screen.
 */
const SHOW_THRESHOLD = 6; // px upward delta before revealing
const HIDE_THRESHOLD = 8; // px downward delta before hiding
const HIDE_AFTER = 80;    // don't hide until scrolled past this offset

export function Navbar({ user }: NavbarProps) {
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastYRef = useRef(0);
  const tickingRef = useRef(false);

  // Close mobile menu on Escape key.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    function onScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastYRef.current;
        if (y < HIDE_AFTER) {
          setHidden(false);
        } else if (delta > HIDE_THRESHOLD) {
          // Collapse mobile menu when the nav hides so it doesn't reappear stale.
          setHidden(true);
          setMenuOpen(false);
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

  const navLinkClass =
    "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-[var(--color-border-default)] bg-[var(--color-bg)]/80 backdrop-blur transition-transform duration-200 ease-out supports-[backdrop-filter]:bg-[var(--color-bg)]/60",
        hidden && "-translate-y-full",
      )}
    >
      <Container>
        {/* ── Top bar ── */}
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

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <Link href="/venues" className={navLinkClass}>
              Find courts
            </Link>
            {user?.role === "venue_owner" && (
              <Link href="/owner" className={navLinkClass}>
                Owner dashboard
              </Link>
            )}
            {user?.role === "admin" && (
              <Link href="/admin" className={navLinkClass}>
                Admin
              </Link>
            )}
            {user && (
              <Link href="/me/bookings" className={navLinkClass}>
                My bookings
              </Link>
            )}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden items-center gap-2 sm:flex">
            {user ? (
              <>
                <span className="text-sm text-[var(--color-fg-muted)]">
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
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile: sign-in/up buttons OR hamburger */}
          <div className="flex items-center gap-2 sm:hidden">
            {!user && (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
            {user && (
              <button
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            )}
          </div>
        </div>
      </Container>

      {/* ── Mobile drawer ── */}
      {user && (
        <div
          id="mobile-menu"
          role="navigation"
          aria-label="Mobile navigation"
          className={cn(
            "overflow-hidden border-t border-[var(--color-border-default)] transition-[max-height,opacity] duration-200 ease-out sm:hidden",
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <Container>
            <div className="flex flex-col gap-1 py-3">
              {/* User identity */}
              <p className="px-3 py-2 text-xs font-medium uppercase tracking-widest text-[var(--color-fg-subtle)]">
                {user.displayName}
              </p>

              <Link
                href="/venues"
                onClick={() => setMenuOpen(false)}
                className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
              >
                Find courts
              </Link>

              {user.role === "player" && (
                <Link
                  href="/me/bookings"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
                >
                  My bookings
                </Link>
              )}

              {user.role === "venue_owner" && (
                <>
                  <Link
                    href="/me/bookings"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
                  >
                    My bookings
                  </Link>
                  <Link
                    href="/owner"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
                  >
                    Owner dashboard
                  </Link>
                </>
              )}

              {user.role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
                >
                  Admin
                </Link>
              )}

              {/* Sign out at the bottom of the drawer */}
              <div className="mt-1 border-t border-[var(--color-border-default)] pt-2">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm font-medium text-[var(--color-danger-600)] hover:bg-[var(--color-bg-subtle)]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
