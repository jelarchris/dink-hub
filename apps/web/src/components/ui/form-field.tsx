import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

/**
 * Form field wrapper. Renders a label, the input slot (children),
 * a helper hint, and an error message slot. Wires up `aria-describedby`
 * so screen readers announce hint + error.
 */
export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string | undefined;
}

export function FormField({ id, label, hint, error, children, className }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, describedBy, invalid })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--color-fg-subtle)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-[var(--color-danger-500)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
