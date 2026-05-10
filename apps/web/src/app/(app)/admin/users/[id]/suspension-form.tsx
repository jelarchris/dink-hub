"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { setUserSuspensionAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  userId: string;
  isSuspended: boolean;
}

export function SuspensionForm({ userId, isSuspended }: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    setUserSuspensionAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value={isSuspended ? "reinstate" : "suspend"} />
      {!isSuspended && (
        <div>
          <label
            htmlFor="susp-reason"
            className="block text-xs font-medium text-[var(--color-fg-muted)]"
          >
            Reason (required to suspend)
          </label>
          <Textarea id="susp-reason" name="reason" rows={2} className="mt-1" />
        </div>
      )}
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      <Button
        type="submit"
        size="sm"
        variant={isSuspended ? "default" : "destructive"}
        disabled={pending}
      >
        {isSuspended ? "Reinstate user" : "Suspend user"}
      </Button>
    </form>
  );
}
