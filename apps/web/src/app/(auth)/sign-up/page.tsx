"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signUpAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

type Role = "player" | "venue_owner";

export default function SignUpPage() {
  const params = useSearchParams();
  const role: Role = params.get("role") === "venue_owner" ? "venue_owner" : "player";
  const isOwner = role === "venue_owner";
  const nextParam = params.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "";
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
    const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
    const continueHref = next || "/venues";
    const continueLabel = next ? "Continue to your booking" : "Browse courts";
    return (
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">Welcome</p>
          <h1 className="text-2xl font-bold tracking-tight">You&apos;re in</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            {needsConfirmation
              ? "Check your email to confirm your account, then sign in to finish your booking."
              : "Account created. Let's find you a court."}
          </p>
        </header>
        <Link href={needsConfirmation ? signInHref : continueHref}>
          <Button size="lg" className="w-full">
            {needsConfirmation ? "Go to sign in" : continueLabel}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
          {isOwner ? "Venue owners" : "Get started"}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {next
            ? "You're one step away from confirming your booking. Create your account to continue."
            : isOwner
              ? "List your courts and start taking bookings. Free to sign up."
              : "Find and book pickleball courts near you. Always free."}
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <input type="hidden" name="role" value={role} />
        {next && <input type="hidden" name="next" value={next} />}

        <FormField
          id="displayName"
          label="Name"
          hint="Shown to venues on your bookings"
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

        <p className="text-xs text-[var(--color-fg-subtle)] leading-relaxed">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline hover:text-[var(--color-fg-muted)]" target="_blank" rel="noopener">
            Terms of Service
          </Link>{" "}
          and acknowledge our{" "}
          <Link href="/privacy" className="underline hover:text-[var(--color-fg-muted)]" target="_blank" rel="noopener">
            Privacy Policy
          </Link>
          .
        </p>

        <SubmitButton size="lg" pendingLabel="Creating account" className="mt-1">
          Create account
        </SubmitButton>

        <p className="text-center text-sm text-[var(--color-fg-muted)]">
          Already have an account?{" "}
          <Link
            href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}
            className="font-medium text-[var(--color-brand-600)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
