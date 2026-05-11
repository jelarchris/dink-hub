"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
// Direct import — never import from the feature barrel in a client component.
import { recordOwnerRefundAction } from "@/features/owner-venues/actions";

interface RecordRefundFormProps {
  bookingId: string;
  paymentId: string;
  paymentVersion: number;
  /** Total amount already paid, formatted (e.g. "₱1,200.00") — shown in the CTA. */
  formattedTotal: string;
}

export function RecordRefundForm({
  bookingId,
  paymentId,
  paymentVersion,
  formattedTotal,
}: RecordRefundFormProps) {
  const [state, formAction] = useActionState(recordOwnerRefundAction, null);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <Alert variant="success" title="Refund recorded">
        The GCash refund of {formattedTotal} has been recorded. The ledger will
        be adjusted in the next weekly payout cycle.
      </Alert>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[var(--color-brand-700)] hover:underline"
      >
        Record GCash refund…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="paymentExpectedVersion" value={paymentVersion} />

      {state && !state.ok && (
        <Alert variant="danger" title="Could not record refund">
          {state.message}
        </Alert>
      )}

      <p className="text-xs text-[var(--color-fg-muted)]">
        Confirm that you have already returned <strong>{formattedTotal}</strong> to
        the player via GCash. This records the reversal in the DinkHub ledger so it
        is deducted from your next weekly invoice.
      </p>

      <div>
        <Label htmlFor="refund-notes">GCash reference / note (optional)</Label>
        <Textarea
          id="refund-notes"
          name="notes"
          maxLength={500}
          rows={2}
          placeholder="e.g. Ref #123456789 — refunded 11 May 2026"
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingLabel="Recording…">
          Confirm refund of {formattedTotal}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[var(--color-fg-muted)] hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
