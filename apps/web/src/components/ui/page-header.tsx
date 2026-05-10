import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Compact, mobile-first page header used across all routes.
 *
 * Visual contract (locked):
 * - Tight vertical rhythm (no big hero h1).
 * - Optional small back link on the left, kicker label on the right.
 * - Optional title/subtitle row beneath, kept small.
 * - Optional primary action that sits inline above the fold (no scrolling
 *   required to find the next CTA).
 *
 * If you find yourself wanting a giant 4xl h1 on a transactional page,
 * reach for marketing copy in a marketing surface instead.
 */
export interface PageHeaderProps {
  /** Tiny back link rendered before the kicker. */
  back?: { href: string; label: string };
  /** Right-aligned uppercase kicker (e.g. "Book a court", "Owner"). */
  kicker?: string;
  /** Section title — keep ≤ 4 words. Renders as h1, text-xl. */
  title?: string;
  /** One-line context. Avoid prose. */
  subtitle?: string;
  /** Primary action node (button or link). Sits to the right of title. */
  action?: ReactNode;
  className?: string;
}

export function PageHeader({
  back,
  kicker,
  title,
  subtitle,
  action,
  className,
}: PageHeaderProps) {
  const showTopRow = Boolean(back ?? kicker);
  const showTitleRow = Boolean(title ?? subtitle ?? action);
  return (
    <header className={cn("mb-3 border-b border-[var(--color-border-default)] pb-3", className)}>
      {showTopRow && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {back ? (
            <Link
              href={back.href}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-fg)] hover:text-[var(--color-brand-700)]"
            >
              <ArrowLeft className="size-4" /> {back.label}
            </Link>
          ) : (
            <span />
          )}
          {kicker && (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
              {kicker}
            </span>
          )}
        </div>
      )}
      {showTitleRow && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
    </header>
  );
}

/** Compact uppercase section label for stripping Card chrome. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]",
        className,
      )}
    >
      {children}
    </h2>
  );
}
