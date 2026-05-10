import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex min-h-24 w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 py-2 text-sm",
        "placeholder:text-[var(--color-fg-subtle)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid
          ? "border-[var(--color-danger-500)]"
          : "border-[var(--color-border-strong)]",
        className,
      )}
      {...props}
    />
  );
});
