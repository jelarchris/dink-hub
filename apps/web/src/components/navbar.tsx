"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Menu,
  X,
  ChevronRight,
  LayoutDashboard,
  CalendarDays,
  Search,
  MapPin,
  Building2,
  Wallet,
  FileText,
  Star,
  Settings,
  Users,
  ScrollText,
  ClipboardList,
  Receipt,
  ShieldCheck,
  LogOut,
  UserCircle2,
} from "lucide-react";
import { signOutAction } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
type DrawerLink = { href: string; label: string; icon: IconType };
type DrawerSection = { heading: string; links: DrawerLink[] };

type Role = "player" | "venue_owner" | "admin";

const ROLE_BADGE: Record<Role, string> = {
  player: "Player",
  venue_owner: "Venue Owner",
  admin: "Admin",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function sectionsFor(role: Role): DrawerSection[] {
  if (role === "player") {
    return [
      {
        heading: "Your account",
        links: [
          { href: "/me", label: "Dashboard", icon: LayoutDashboard },
          { href: "/me/bookings", label: "My bookings", icon: CalendarDays },
          { href: "/me/profile", label: "Edit profile", icon: UserCircle2 },
        ],
      },
      {
        heading: "Quick actions",
        links: [
          { href: "/venues", label: "Find courts", icon: Search },
        ],
      },
    ];
  }
  if (role === "venue_owner") {
    return [
      {
        heading: "Your account",
        links: [
          { href: "/owner", label: "Owner dashboard", icon: LayoutDashboard },
          { href: "/me/bookings", label: "My bookings", icon: CalendarDays },
        ],
      },
      {
        heading: "Manage venues",
        links: [
          { href: "/owner/venues", label: "My venues", icon: Building2 },
          { href: "/owner/payments", label: "Payments", icon: Wallet },
          { href: "/owner/invoices", label: "Invoices", icon: FileText },
          { href: "/owner/reviews", label: "Reviews", icon: Star },
          { href: "/owner/settings", label: "Settings", icon: Settings },
        ],
      },
      {
        heading: "Quick actions",
        links: [
          { href: "/venues", label: "Find courts", icon: Search },
        ],
      },
    ];
  }
  // admin
  return [
    {
      heading: "Your account",
      links: [
        { href: "/admin", label: "Admin dashboard", icon: ShieldCheck },
      ],
    },
    {
      heading: "Operations",
      links: [
        { href: "/admin/venues", label: "Venues", icon: MapPin },
        { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/payouts", label: "Payouts", icon: Wallet },
        { href: "/admin/invoices", label: "Invoices", icon: Receipt },
        { href: "/admin/ledger", label: "Ledger", icon: ClipboardList },
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        { href: "/admin/system-fee", label: "System fee", icon: Settings },
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
  ];
}

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

  // SSR-safe "is on client" flag for portal rendering. Server snapshot is
  // false; client snapshot is true. Avoids hydration mismatch and avoids
  // setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Close mobile menu on Escape key + lock body scroll while drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
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

  // The drawer must be rendered OUTSIDE the <header> via a portal: the header
  // uses `backdrop-blur`, which per CSS spec creates a containing block for
  // `position: fixed` descendants — making the drawer scoped to the header
  // box (64px tall) instead of the viewport. Portaling to <body> avoids that.
  const drawer = user && mounted
    ? createPortal(
        <div
          className={cn(
            "fixed inset-0 z-50 sm:hidden",
            menuOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          aria-hidden={!menuOpen}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => setMenuOpen(false)}
            className={cn(
              "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200",
              menuOpen ? "opacity-100" : "opacity-0",
            )}
          />

          {/* Panel */}
          <aside
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className={cn(
              "absolute inset-y-0 right-0 flex h-full w-[88vw] max-w-sm flex-col bg-[var(--color-bg)] shadow-2xl transition-transform duration-300 ease-out",
              menuOpen ? "translate-x-0" : "translate-x-full",
            )}
          >
            {/* Drawer header: identity + close */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-default)] px-5 pb-4 pt-5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-lg font-semibold text-[var(--color-fg)]"
                >
                  {initialsOf(user.displayName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--color-fg)]">
                    {user.displayName}
                  </p>
                  <p className="truncate text-xs text-[var(--color-fg-muted)]">{user.email}</p>
                  <span className="mt-1 inline-flex items-center rounded-full bg-[var(--color-brand-500)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-brand-600)]">
                    {ROLE_BADGE[user.role]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-fg)]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sections (scrollable) */}
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {sectionsFor(user.role).map((section) => (
                <div key={section.heading}>
                  <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-fg-subtle)]">
                    {section.heading}
                  </p>
                  <div className="divide-y divide-[var(--color-border-default)] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)]">
                    {section.links.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]"
                      >
                        <Icon size={18} className="text-[var(--color-fg-muted)]" />
                        <span className="flex-1">{label}</span>
                        <ChevronRight size={16} className="text-[var(--color-fg-subtle)]" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Sign out + theme toggle pinned to bottom */}
            <div className="border-t border-[var(--color-border-default)] p-4 space-y-2">
              <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-4 py-2.5">
                <span className="text-sm font-medium text-[var(--color-fg-muted)]">Appearance</span>
                <ThemeToggle className="inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] transition-colors" />
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] px-4 py-3 text-sm font-semibold text-[var(--color-danger-600)] hover:bg-[var(--color-danger-600)]/10"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
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
          <div className="hidden items-center gap-1 sm:flex">
            <ThemeToggle />
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

      {/* Mobile drawer is rendered via portal in `drawer` (see above). */}
    </header>
    {drawer}
    </>
  );
}
