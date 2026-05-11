"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { voidOwnerInvoiceAction } from "@/features/admin/actions";
import type { ActionResult } from "@/features/auth";

interface Props {
  invoiceId: string;
  version: number;
}

export function VoidInvoiceForm({ invoiceId, version }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    voidOwnerInvoiceAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="void-reason"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Reason for voiding (required)
        </label>
        <Textarea
          id="void-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          maxLength={500}
          className="mt-1"
          placeholder="e.g. dispute resolved — venue credited separately"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton size="sm" variant="destructive" pendingLabel="Voiding">
        Void invoice
      </SubmitButton>
    </form>
  );
}
