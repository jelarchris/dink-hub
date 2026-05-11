"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { verifyOwnerInvoiceAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  invoiceId: string;
  version: number;
}

export function VerifyInvoiceForm({ invoiceId, version }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    verifyOwnerInvoiceAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="verify-notes"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Notes (optional)
        </label>
        <Textarea
          id="verify-notes"
          name="notes"
          rows={2}
          maxLength={500}
          className="mt-1"
          placeholder="e.g. matched GCash transaction 1234567890"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton size="sm" pendingLabel="Verifying">
        Verify &amp; settle
      </SubmitButton>
    </form>
  );
}
