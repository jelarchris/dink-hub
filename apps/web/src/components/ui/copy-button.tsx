"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface CopyButtonProps {
  /** Raw value to write to the clipboard. */
  value: string;
  /** What we're copying — used in the aria-label and toast text. */
  label?: string;
  className?: string;
  /** Visual size; default is comfortable for thumb taps. */
  size?: "sm" | "md";
}

/**
 * One-tap copy button with a 1.6s checkmark confirmation.
 *
 * Falls back silently if the Clipboard API isn't available (older browsers,
 * non-secure context). We don't surface an error toast — the value is still
 * visible on screen so the user can long-press / select manually.
 */
export function CopyButton({ value, label = "value", className, size = "md" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick(): Promise<void> {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // best-effort; nothing actionable to surface to the user.
    }
  }

  const sizeClasses =
    size === "sm" ? "h-7 px-2 text-xs gap-1" : "h-9 px-3 text-sm gap-1.5";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border font-semibold transition-colors",
        "border-[var(--color-border-default)] bg-[var(--color-bg)] hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)]",
        copied && "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]",
        sizeClasses,
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden /> Copy
        </>
      )}
    </button>
  );
}
