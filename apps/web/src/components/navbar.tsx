import Link from "next/link";
import { signOutAction } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export interface NavbarProps {
  user: { email: string; displayName: string; role: "player" | "venue_owner" | "admin" } | null;
}

export function Navbar({ user }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border-default)] bg-[var(--color-bg)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/60">
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
