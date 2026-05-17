"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateVoucherStatusAction } from "@/features/vouchers/actions";
import type { ActionResult } from "@/features/auth";

type Status = "active" | "paused" | "expired";

const NEXT: Record<Status, Status> = {
  active: "paused",
  paused: "active",
  expired: "active",
};

const LABEL: Record<Status, string> = {
  active: "Pause voucher",
  paused: "Reactivate voucher",
  expired: "Reactivate voucher",
};

export function StatusForm({
  voucherId,
  currentStatus,
}: {
  voucherId: string;
  currentStatus: Status;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateVoucherStatusAction,
    null,
  );
  const target = NEXT[currentStatus];

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="voucherId" value={voucherId} />
        <input type="hidden" name="status" value={target} />
        <SubmitButton size="sm" pendingLabel="Updating">
          {LABEL[currentStatus]}
        </SubmitButton>
      </form>

      {currentStatus !== "expired" && (
        <form action={formAction}>
          <input type="hidden" name="voucherId" value={voucherId} />
          <input type="hidden" name="status" value="expired" />
          <SubmitButton size="sm" variant="ghost" pendingLabel="Updating">
            Mark expired
          </SubmitButton>
        </form>
      )}

      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}
      {state && state.ok === true && (
        <Alert variant="success" className="text-xs">
          Status updated.
        </Alert>
      )}
    </div>
  );
}
