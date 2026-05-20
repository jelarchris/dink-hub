"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Zap } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { joinSessionAction } from "@/features/open-play/actions";
import { formatPHP } from "@/lib/money";
import type { ActionResult } from "@/features/auth";

export interface JoinFormProps {
  sessionId: string;
  sessionTitle: string;
  totalCentavos: bigint;
  defaultContactEmail: string;
}

export function JoinForm({
  sessionId,
  sessionTitle,
  totalCentavos,
  defaultContactEmail,
}: JoinFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult<{ signupId: string }> | null, FormData>(
    joinSessionAction,
    null,
  );

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const topError = state && !state.ok && !state.fieldErrors ? state.message : undefined;

  useEffect(() => {
    if (state?.ok && state.data?.signupId) {
      router.push(`/open-play/signups/${state.data.signupId}/pay`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg)] p-4">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="rounded-[var(--radius-md)] bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600 px-3 py-2.5 text-white shadow-[0_4px_12px_-4px_rgba(124,58,237,0.5)]">
        <div className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide text-violet-700">
          <Zap className="size-3" /> Open Play
        </div>
        <div className="mt-1 text-base font-bold leading-tight">{sessionTitle}</div>
        <div className="mt-0.5 text-[11px] font-semibold text-white/90">
          Reserve your spot, then complete payment in GCash.
        </div>
      </div>

      {topError && <Alert variant="danger">{topError}</Alert>}

      <FormField
        id="contactEmail"
        label="Contact email"
        hint="Where we send confirmation and reminders. Defaults to your account email."
        error={fieldErrors.contactEmail?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="contactEmail"
            type="email"
            defaultValue={defaultContactEmail}
            aria-describedby={describedBy}
            invalid={invalid}
            placeholder="you@example.com"
          />
        )}
      </FormField>

      <SubmitButton size="lg" pendingLabel="Reserving…" className="w-full">
        <Trophy className="size-4" /> Reserve & pay {formatPHP(totalCentavos)}
      </SubmitButton>
      <p className="text-center text-[11px] text-[var(--color-fg-muted)]">
        We&apos;ll take you straight to the payment screen. Your spot is held for 15 minutes.
      </p>
    </form>
  );
}
