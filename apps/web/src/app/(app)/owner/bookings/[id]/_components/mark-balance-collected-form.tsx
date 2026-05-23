"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
// Direct import — never import from the feature barrel in a client component
// to avoid webpack pulling in the Drizzle/Postgres client.
import { markBalanceCollectedAction } from "@/features/owner-venues/actions";

interface MarkBalanceCollectedFormProps {
  bookingId: string;
  version: number;
  formattedBalance: string;
}

export function MarkBalanceCollectedForm({
  bookingId,
  version,
  formattedBalance,
}: MarkBalanceCollectedFormProps) {
  const [state, formAction] = useActionState(markBalanceCollectedAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="expectedVersion" value={version} />

      {state && !state.ok && (
        <Alert variant="danger" title="Could not record balance">
          {state.message}
        </Alert>
      )}

      <SubmitButton size="sm" pendingLabel="Saving…">
        Mark {formattedBalance} balance collected
      </SubmitButton>
    </form>
  );
}
