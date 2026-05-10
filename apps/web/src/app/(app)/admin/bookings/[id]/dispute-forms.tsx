"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { openDisputeAction, resolveDisputeAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

export function OpenDisputeForm({
  paymentId,
  version,
}: {
  paymentId: string;
  version: number;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    openDisputeAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div>
        <label
          htmlFor="dispute-reason"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Reason for opening dispute (required)
        </label>
        <Textarea
          id="dispute-reason"
          name="reason"
          rows={3}
          required
          minLength={3}
          maxLength={500}
          className="mt-1"
        />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "Opening…" : "Open dispute"}
      </Button>
    </form>
  );
}

export function ResolveDisputeForm({
  paymentId,
  version,
  resolution,
}: {
  paymentId: string;
  version: number;
  resolution: "refund_full" | "rejected";
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    resolveDisputeAction,
    null,
  );
  const label =
    resolution === "refund_full"
      ? "Resolve with full refund"
      : "Reject dispute (return to verified)";
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="resolution" value={resolution} />
      <div>
        <label
          htmlFor={`resolve-notes-${resolution}`}
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Notes (optional)
        </label>
        <Textarea
          id={`resolve-notes-${resolution}`}
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
      <Button
        type="submit"
        size="sm"
        variant={resolution === "refund_full" ? "destructive" : "default"}
        disabled={pending}
      >
        {pending ? "Resolving…" : label}
      </Button>
    </form>
  );
}
