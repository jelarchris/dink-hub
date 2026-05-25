import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Container } from "@/components/ui/container";

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border-default)] bg-[var(--color-bg-muted)]">
      <Container>
        <div className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand + tagline */}
          <div className="space-y-1.5">
            <Link href="/" aria-label="DinkHub home">
              <BrandWordmark className="text-xl" />
            </Link>
            <p className="text-xs text-[var(--color-fg-subtle)]">
              Pickleball court bookings in the Philippines
            </p>
          </div>

          {/* Navigation links */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <li>
                <Link
                  href="/venues"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  Find courts
                </Link>
              </li>
              <li>
                <Link
                  href="/host"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  List your venue
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <a
                  href="https://www.facebook.com/jelarjoychristian"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom strip */}
        <div className="flex flex-col gap-1 border-t border-[var(--color-border-default)] py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-fg-subtle)]">
            &copy; {CURRENT_YEAR} DinkHub. All rights reserved.
          </p>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Made in Agusan del Sur 🇵🇭
          </p>
        </div>
      </Container>
    </footer>
  );
}
