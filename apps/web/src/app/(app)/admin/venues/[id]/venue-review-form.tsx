"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { reviewVenueAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";
import type { Venue } from "@/db/schema";
import type { VenueReviewAction } from "@/features/admin/schema";

interface Props {
  venueId: string;
  version: number;
  status: Venue["status"];
}

const ACTION_FOR_STATUS: Record<Venue["status"], ReadonlyArray<VenueReviewAction>> = {
  draft: [],
  pending_review: ["approve", "reject"],
  active: ["suspend"],
  suspended: ["reinstate"],
  rejected: [],
};

const LABEL: Record<VenueReviewAction, string> = {
  approve: "Approve & publish",
  reject: "Reject",
  suspend: "Suspend",
  reinstate: "Reinstate",
};

const VARIANT: Record<VenueReviewAction, "default" | "ghost" | "destructive"> = {
  approve: "default",
  reject: "destructive",
  suspend: "destructive",
  reinstate: "default",
};

export function VenueReviewForm({ venueId, version, status }: Props) {
  const allowed = ACTION_FOR_STATUS[status];
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    reviewVenueAction,
    null,
  );

  if (allowed.length === 0) {
    return (
      <p className="text-xs text-[var(--color-fg-muted)]">
        No review actions available for this status.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="expectedVersion" value={version} />

      {(allowed.includes("reject") || allowed.includes("suspend")) && (
        <div>
          <label
            htmlFor="reason"
            className="block text-xs font-medium text-[var(--color-fg-muted)]"
          >
            Reason{" "}
            <span className="font-normal">
              (required for reject/suspend, optional otherwise)
            </span>
          </label>
          <Textarea id="reason" name="reason" rows={3} className="mt-1" />
        </div>
      )}

      {state && state.ok === false && (
        <Alert variant="danger" className="text-xs">
          {state.message}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {allowed.map((action) => (
          <Button
            key={action}
            type="submit"
            name="action"
            value={action}
            disabled={pending}
            variant={VARIANT[action]}
            size="sm"
          >
            {LABEL[action]}
          </Button>
        ))}
      </div>
    </form>
  );
}
