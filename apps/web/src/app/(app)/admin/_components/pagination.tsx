import Link from "next/link";
import { cn } from "@/lib/cn";

interface PaginationProps {
  basePath: string;
  currentParams: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
  className?: string;
}

function buildHref(
  basePath: string,
  currentParams: Record<string, string>,
  overrides: Record<string, string | undefined>,
): string {
  const merged: Record<string, string> = { ...currentParams };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  basePath,
  currentParams,
  page,
  pageSize,
  total,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between text-sm text-[var(--color-fg-muted)]",
        className,
      )}
    >
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        {prev !== null ? (
          <Link
            href={buildHref(basePath, currentParams, { page: String(prev) })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 hover:bg-[var(--color-bg-muted)]"
          >
            ← Prev
          </Link>
        ) : (
          <span className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-1.5 opacity-50">
            ← Prev
          </span>
        )}
        {next !== null ? (
          <Link
            href={buildHref(basePath, currentParams, { page: String(next) })}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 hover:bg-[var(--color-bg-muted)]"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-1.5 opacity-50">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
