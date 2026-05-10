"use client";

import { useActionState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/features/auth";
import { setCourtActiveAction } from "@/features/owner-venues/actions";

const initialState: ActionResult<never> | null = null;

export function CourtArchiveButton({
  courtId,
  venueId,
  isActive,
}: {
  courtId: string;
  venueId: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState(setCourtActiveAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <SubmitButton
        size="sm"
        variant="outline"
        pendingLabel={isActive ? "Archiving" : "Restoring"}
        title={state && !state.ok ? state.message : undefined}
      >
        {isActive ? (
          <>
            <Archive className="size-4" /> Archive
          </>
        ) : (
          <>
            <RotateCcw className="size-4" /> Restore
          </>
        )}
      </SubmitButton>
      {state && !state.ok && (
        <span className="ml-2 text-xs text-[var(--color-danger-500)]" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
