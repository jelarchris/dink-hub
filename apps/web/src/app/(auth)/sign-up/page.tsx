"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Role = "player" | "venue_owner";

export default function SignUpPage() {
  const [role, setRole] = useState<Role>("player");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    signUpAction,
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;
  const success = state?.ok === true;
  const needsConfirmation =
    success && (state.data as { needsConfirmation: boolean }).needsConfirmation;

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re in</CardTitle>
          <CardDescription>
            {needsConfirmation
              ? "Check your email to confirm your account, then sign in."
              : "Account created. Let's find you a court."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={needsConfirmation ? "/sign-in" : "/venues"}>
            <Button size="lg" className="w-full">
              {needsConfirmation ? "Go to sign in" : "Browse courts"}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Free for players. Venue owners pay only on bookings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          {formError && <Alert variant="danger">{formError}</Alert>}

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">I am a</legend>
            <RoleOption value="player" current={role} onSelect={setRole} label="Player" hint="Book courts" />
            <RoleOption value="venue_owner" current={role} onSelect={setRole} label="Venue owner" hint="List my courts" />
          </fieldset>
          <input type="hidden" name="role" value={role} />

          <FormField
            id="displayName"
            label="Name"
            hint="Shown to venue owners on bookings"
            error={fieldErrors?.displayName?.[0]}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="displayName"
                type="text"
                autoComplete="name"
                required
                placeholder="Juan dela Cruz"
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>

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

          <FormField
            id="password"
            label="Password"
            hint="At least 8 characters with letters and a number"
            error={fieldErrors?.password?.[0]}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </FormField>

          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} action="signup" />

          <SubmitButton size="lg" pendingLabel="Creating account" className="mt-2">
            Create account
          </SubmitButton>

          <p className="text-center text-sm text-[var(--color-fg-muted)]">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-[var(--color-brand-600)] hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleOption({
  value,
  current,
  onSelect,
  label,
  hint,
}: {
  value: Role;
  current: Role;
  onSelect: (v: Role) => void;
  label: string;
  hint: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={
        "flex flex-col items-start gap-0.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors " +
        (selected
          ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50)] text-[var(--color-brand-900)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-muted)]")
      }
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-[var(--color-fg-muted)]">{hint}</span>
    </button>
  );
}
