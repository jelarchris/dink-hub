"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { updateUserRoleAction, roleValues } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  userId: string;
  currentRole: "player" | "venue_owner" | "admin";
}

export function UpdateRoleForm({ userId, currentRole }: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateUserRoleAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label htmlFor="role" className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Role
        </label>
        <Select id="role" name="role" defaultValue={currentRole} className="mt-1">
          {roleValues.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label
          htmlFor="role-reason"
          className="block text-xs font-medium text-[var(--color-fg-muted)]"
        >
          Reason (optional, recorded in audit log)
        </label>
        <Textarea id="role-reason" name="reason" rows={2} className="mt-1" />
      </div>
      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      {state && state.ok === true && (
        <Alert variant="success" className="text-xs">
          Role updated.
        </Alert>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        Update role
      </Button>
    </form>
  );
}
