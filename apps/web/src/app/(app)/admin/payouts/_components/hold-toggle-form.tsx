"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { togglePayoutHoldAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  payoutId: string;
  version: number;
  action: "hold" | "release";
}

export function HoldToggleForm({ payoutId, version, action }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    togglePayoutHoldAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="action" value={action} />
      {action === "hold" && (
        <div>
          <label
            htmlFor="hold-reason"
            className="block text-xs font-medium text-[var(--color-fg-muted)]"
          >
            Reason for hold (required)
          </label>
          <Textarea
            id="hold-reason"
            name="reason"
            rows={2}
            required
            minLength={3}
            maxLength={500}
            className="mt-1"
          />
        </div>
      )}
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton
        size="sm"
        variant={action === "hold" ? "destructive" : "default"}
        pendingLabel="Working"
      >
        {action === "hold" ? "Place on hold" : "Release hold"}
      </SubmitButton>
    </form>
  );
}
