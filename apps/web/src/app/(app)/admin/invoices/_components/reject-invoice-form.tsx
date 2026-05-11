"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { rejectOwnerInvoiceAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  invoiceId: string;
  version: number;
}

export function RejectInvoiceForm({ invoiceId, version }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    rejectOwnerInvoiceAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="reject-reason"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Reason for rejection (required)
        </label>
        <Textarea
          id="reject-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          maxLength={500}
          className="mt-1"
          placeholder="e.g. amount on receipt does not match invoice total"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton size="sm" variant="destructive" pendingLabel="Rejecting">
        Reject receipt
      </SubmitButton>
    </form>
  );
}
