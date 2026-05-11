"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
// Direct import — never import from the feature barrel in a client component
// to avoid webpack pulling in the Drizzle/Postgres client.
import { cancelBookingByOwnerAction } from "@/features/owner-venues/actions";

interface CancelBookingFormProps {
  bookingId: string;
  version: number;
  /**
   * When true, the booking is already past the player's 15-min cancel window
   * AND was paid — the player will need a refund coordinated out-of-band.
   * Used to surface a refund hint in the UI.
   */
  isConfirmed: boolean;
}

const CATEGORY_OPTIONS = [
  { value: "weather", label: "Weather" },
  { value: "court_unavailable", label: "Court unavailable (damage / maintenance)" },
  { value: "venue_closure", label: "Venue closure (power, holiday, emergency)" },
  { value: "player_request", label: "Player requested cancellation" },
  { value: "other", label: "Other" },
] as const;

export function CancelBookingForm({ bookingId, version, isConfirmed }: CancelBookingFormProps) {
  const [state, formAction] = useActionState(cancelBookingByOwnerAction, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[var(--color-danger-600)] hover:underline"
      >
        Cancel booking…
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />

      {state && !state.ok && (
        <Alert variant="danger" title="Could not cancel">
          {state.message}
        </Alert>
      )}

      {isConfirmed && (
        <Alert variant="warning" title="Refund required">
          This booking is paid. After cancelling, coordinate the GCash refund
          with the player and ask DinkHub support to record the dispute so the
          weekly invoice is adjusted.
        </Alert>
      )}

      <div>
        <Label htmlFor="cancel-category">Reason category</Label>
        <Select id="cancel-category" name="category" required defaultValue="other" className="mt-1">
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="cancel-reason">Details (visible to player)</Label>
        <Textarea
          id="cancel-reason"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="e.g. Court flooded after heavy rain — courts unavailable until Monday."
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton variant="destructive" size="sm" pendingLabel="Cancelling…">
          Confirm cancellation
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[var(--color-fg-muted)] hover:underline"
        >
          Keep booking
        </button>
      </div>
    </form>
  );
}
