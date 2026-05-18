"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { joinSessionAction } from "@/features/open-play/actions";
import { formatPHP } from "@/lib/money";
import type { ActionResult } from "@/features/auth";

export interface JoinFormProps {
  sessionId: string;
  totalCentavos: bigint;
  defaultContactEmail: string;
}

export function JoinForm({ sessionId, totalCentavos, defaultContactEmail }: JoinFormProps) {
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
        <Trophy className="size-4" /> Reserve spot — pay {formatPHP(totalCentavos)}
      </SubmitButton>
      <p className="text-center text-[11px] text-[var(--color-fg-muted)]">
        We&apos;ll hold your spot for 15 minutes while you complete payment in GCash.
      </p>
    </form>
  );
}
