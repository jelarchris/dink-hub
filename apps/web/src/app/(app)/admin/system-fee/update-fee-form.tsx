"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { updateSystemFeeAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

export function UpdateFeeForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateSystemFeeAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="feePhp" className="block text-xs font-medium text-[var(--color-fg-muted)]">
          New fee (PHP)
        </label>
        <Input
          id="feePhp"
          name="feePhp"
          type="text"
          inputMode="decimal"
          placeholder="20.00"
          required
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="fee-notes" className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Notes (recorded in history)
        </label>
        <Textarea id="fee-notes" name="notes" rows={2} className="mt-1" />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      {state && state.ok === true && (
        <Alert variant="success" className="text-xs">
          Fee updated.
        </Alert>
      )}
      <SubmitButton size="sm" pendingLabel="Updating">
        Update fee
      </SubmitButton>
    </form>
  );
}
