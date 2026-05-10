"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/cn";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  pendingLabel?: string;
}

/**
 * Drop-in submit button that wires into the parent <form>'s pending state via
 * useFormStatus. Shows a small spinning pickleball while the action is in flight
 * and forces the button into a disabled state. Works with React 19 Server Actions
 * and useActionState forms — no extra wiring required at the call site.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      {...rest}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn(className)}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block size-4 animate-spin rounded-full"
            style={{
              background: `
                radial-gradient(circle at 28% 28%, rgba(255,255,255,0.5) 0, rgba(255,255,255,0) 35%),
                radial-gradient(circle at 22% 50%, #b9c91a 0 14%, transparent 16%),
                radial-gradient(circle at 50% 22%, #b9c91a 0 14%, transparent 16%),
                radial-gradient(circle at 78% 50%, #b9c91a 0 14%, transparent 16%),
                radial-gradient(circle at 50% 78%, #b9c91a 0 14%, transparent 16%),
                radial-gradient(circle at 50% 50%, #e7f23b 0 60%, #d6e22a 100%)
              `,
              animationDuration: "0.9s",
              animationTimingFunction: "linear",
            }}
          />
          <span>{pendingLabel ?? "Working"}…</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
