"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { forceCancelBookingAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  bookingId: string;
  version: number;
}

export function ForceCancelForm({ bookingId, version }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    forceCancelBookingAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="cancel-reason"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Reason (required, recorded on the booking)
        </label>
        <Textarea
          id="cancel-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          className="mt-1"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton size="sm" variant="destructive" pendingLabel="Cancelling">
        Force-cancel booking
      </SubmitButton>
    </form>
  );
}
