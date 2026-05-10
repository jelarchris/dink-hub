"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account with that email exists, we&apos;ve sent a reset link. It expires in 1
            hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Didn&apos;t receive it? Check your spam folder, then{" "}
            <Link
              href="/forgot-password"
              className="font-medium text-[var(--color-brand-600)] hover:underline"
            >
              try again
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter the email on your account and we&apos;ll send you a link to reset it.
        </CardDescription>
      </CardHeader>
      <CardContent>
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

          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action="forgot_password" />

          <SubmitButton size="lg" pendingLabel="Sending" className="mt-2">
            Send reset link
          </SubmitButton>

          <p className="text-center text-sm text-[var(--color-fg-muted)]">
            Remembered it?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-[var(--color-brand-600)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
