"use client";

import { useActionState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [state, formAction, isPending] = useActionState(setCourtActiveAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={isActive ? "outline" : "outline"}
        disabled={isPending}
        aria-busy={isPending}
        title={state && !state.ok ? state.message : undefined}
      >
        {isActive ? (
          <>
            <Archive className="size-4" /> {isPending ? "Archiving…" : "Archive"}
          </>
        ) : (
          <>
            <RotateCcw className="size-4" /> {isPending ? "Restoring…" : "Restore"}
          </>
        )}
      </Button>
      {state && !state.ok && (
        <span className="ml-2 text-xs text-[var(--color-danger-500)]" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
