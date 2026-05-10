"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { markPayoutPaidAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  payoutId: string;
  version: number;
}

export function MarkPaidForm({ payoutId, version }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    markPayoutPaidAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="paid-ref"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          GCash transfer reference (required)
        </label>
        <Input
          id="paid-ref"
          name="paidReference"
          required
          minLength={3}
          maxLength={120}
          className="mt-1"
        />
      </div>
      <div>
        <label
          htmlFor="paid-notes"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Notes (optional)
        </label>
        <Textarea
          id="paid-notes"
          name="notes"
          rows={2}
          maxLength={500}
          className="mt-1"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton size="sm" pendingLabel="Marking">
        Mark as paid
      </SubmitButton>
    </form>
  );
}
