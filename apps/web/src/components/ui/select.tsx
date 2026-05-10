import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-11 w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-3 pr-9 text-sm",
        "bg-[image:var(--icon-chevron)] bg-[length:16px_16px] bg-[position:right_0.75rem_center] bg-no-repeat",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid
          ? "border-[var(--color-danger-500)]"
          : "border-[var(--color-border-strong)]",
        className,
      )}
      style={{
        // Inline data URI chevron so we don't depend on a global CSS var.
        backgroundImage:
          'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23667085\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'/></svg>")',
      }}
      {...props}
    >
      {children}
    </select>
  );
});
