import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-600)] active:bg-[var(--color-brand-700)]",
        accent:
          "bg-[var(--color-accent-500)] text-white hover:bg-[var(--color-accent-600)]",
        secondary:
          "bg-[var(--color-bg-muted)] text-[var(--color-fg)] hover:bg-[var(--color-border-default)]",
        outline:
          "border border-[var(--color-border-strong)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]",
        ghost:
          "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)]",
        destructive:
          "bg-[var(--color-danger-500)] text-white hover:opacity-90",
        link:
          "text-[var(--color-brand-600)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm [&_svg]:size-4",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        xl: "h-14 px-8 text-base font-semibold [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
