"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
// Direct import — never import from the feature barrel in a client component
// to avoid webpack pulling in the Drizzle/Postgres client.
import { markNoShowAction } from "@/features/owner-venues/actions";

interface NoShowFormProps {
  bookingId: string;
  version: number;
}

export function NoShowForm({ bookingId, version }: NoShowFormProps) {
  const [state, formAction] = useActionState(markNoShowAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />

      {state && !state.ok && (
        <Alert variant="danger" title="Could not mark as no-show">
          {state.message}
        </Alert>
      )}

      <SubmitButton variant="destructive" size="sm" pendingLabel="Marking…">
        Mark as no-show
      </SubmitButton>
    </form>
  );
}
