"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signInAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function SignInPage() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    signInAction,
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to book courts and track your games.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="next" value={next} />

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

          <FormField id="password" label="Password" error={fieldErrors?.password?.[0]}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>

          <SubmitButton size="lg" pendingLabel="Signing in" className="mt-2">
            Sign in
          </SubmitButton>

          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action="signin" />

          <p className="text-center text-sm text-[var(--color-fg-muted)]">
            New to DinkHub?{" "}
            <Link href="/sign-up" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
