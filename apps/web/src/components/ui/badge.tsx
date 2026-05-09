import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        success:
          "bg-[var(--color-brand-100)] text-[var(--color-brand-900)]",
        warning: "bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
        info: "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
        danger: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
        neutral:
          "bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
