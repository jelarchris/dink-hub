"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    requestPasswordResetAction,
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;
  const success = state?.ok === true;

  if (success) {
    return (
      <div className="space-y-3">
        <header className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">Reset link sent</p>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            If an account with that email exists, we&apos;ve sent a reset link. It expires in 1 hour.
          </p>
        </header>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Didn&apos;t receive it? Check your spam folder, then{" "}
          <Link href="/forgot-password" className="font-medium text-[var(--color-brand-600)] hover:underline">
            try again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">Account recovery</p>
        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Enter the email on your account and we&apos;ll send a reset link.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <FormField id="email" label="Email" error={fieldErrors?.email?.[0]}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="you@example.com"
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <SubmitButton size="lg" pendingLabel="Sending" className="mt-1">
          Send reset link
        </SubmitButton>

        <p className="text-center text-sm text-[var(--color-fg-muted)]">
          Remembered it?{" "}
          <Link href="/sign-in" className="font-medium text-[var(--color-brand-600)] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
