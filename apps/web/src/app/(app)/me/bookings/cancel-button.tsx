"use client";

import { useActionState, useState } from "react";
import { cancelBookingAction } from "@/features/booking/actions";
import type { ActionResult } from "@/features/auth";
import { Button } from "@/components/ui/button";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    cancelBookingAction,
    null,
  );
  const error = state && !state.ok ? state.message : null;

  if (state?.ok) {
    return <span className="text-sm text-[var(--color-fg-muted)]">Cancelled</span>;
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Cancel
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <span className="text-xs text-[var(--color-fg-muted)]">Sure?</span>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "…" : "Yes, cancel"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        No
      </Button>
      {error && <span className="ml-2 text-xs text-[var(--color-danger-500)]">{error}</span>}
    </form>
  );
}
