"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import {
  registerOpenPlayInterestAction,
  type OpenPlayInterestActionState,
} from "@/features/open-play-interest";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function OpenPlayTeaserForm() {
  const [state, formAction] = useActionState<OpenPlayInterestActionState, FormData>(
    registerOpenPlayInterestAction,
    null,
  );

  if (state?.ok) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] p-5 text-center"
      >
        <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-full bg-[var(--color-brand-500)] text-white">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <p className="text-base font-semibold text-[var(--color-fg)]">
          {state.alreadyRegistered ? "You're already on the list." : "You're on the list!"}
        </p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          We&apos;ll email you the moment Open Play opens in your area.
        </p>
      </div>
    );
  }

  const fieldError = state && !state.ok ? state.fieldErrors?.email?.[0] : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {formError && <Alert variant="danger">{formError}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="open-play-email" className="sr-only">
          Email address
        </label>
        <Input
          id="open-play-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "open-play-email-error" : undefined}
          className="sm:flex-1"
        />
        {/* Honeypot — visually hidden, must stay empty. Bots fill every input. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        <SubmitButton size="lg" pendingLabel="Saving">
          Notify me
        </SubmitButton>
      </div>
      {fieldError && (
        <p id="open-play-email-error" className="text-sm text-[var(--color-danger-600)]">
          {fieldError}
        </p>
      )}
      <p className="text-xs text-[var(--color-fg-subtle)]">
        We&apos;ll only email you about Open Play in your area. No spam, unsubscribe anytime.
      </p>
    </form>
  );
}
