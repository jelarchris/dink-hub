"use client";

/**
 * Client-side nav chip used by the owner schedule grid (date strip, court tabs,
 * agenda/grid toggle). Wraps `<Link>` so prefetch still works, but on click it
 * calls `router.push()` inside `startTransition` so:
 *
 *   1. The URL changes immediately.
 *   2. The new RSC payload streams in without unmounting the page shell.
 *   3. `isPending` flips on, giving the chip an instant "loading" tint so the
 *      owner gets visual feedback even when the network roundtrip is slow.
 *
 * Without this, every click bounces through a full server roundtrip with no
 * UI feedback — feels like a 5–6s freeze on slow links.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function NavChip({
  href,
  active,
  children,
  className,
  activeClassName,
  inactiveClassName,
  prefetch = true,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  prefetch?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Respect modifier keys / middle-click / target=_blank.
    if (
      e.defaultPrevented ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    ) {
      return;
    }
    e.preventDefault();
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={handleClick}
      aria-current={active ? "page" : undefined}
      aria-busy={isPending || undefined}
      className={cn(
        className,
        active ? activeClassName : inactiveClassName,
        isPending && "opacity-60",
      )}
    >
      {children}
    </Link>
  );
}
