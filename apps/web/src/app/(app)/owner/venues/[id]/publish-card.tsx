"use client";

import { useActionState } from "react";
import { Send, Undo2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/features/auth";
import { setVenueStatusAction } from "@/features/owner-venues/actions";
import type { Venue } from "@/db/schema";

const initialState: ActionResult<never> | null = null;

export function VenuePublishCard({
  venue,
  courtCount,
}: {
  venue: Venue;
  courtCount: number;
}) {
  const [state, formAction, isPending] = useActionState(setVenueStatusAction, initialState);

  if (venue.status === "active") {
    return (
      <Card className="mt-6 border-[var(--color-brand-200)] bg-[var(--color-brand-50)]">
        <CardHeader>
          <CardTitle>Live on DinkHub</CardTitle>
          <CardDescription>
            Players can find this venue and book available slots. Contact support to take it offline.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (venue.status === "suspended") {
    return (
      <Card className="mt-6 border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle>Suspended</CardTitle>
          <CardDescription>
            This venue has been suspended. Contact support to restore it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canSubmit = courtCount > 0 && Boolean(venue.gcashAccountName) && Boolean(venue.gcashAccountNumber);
  const blockers: string[] = [];
  if (courtCount === 0) blockers.push("Add at least one court.");
  if (!venue.gcashAccountName || !venue.gcashAccountNumber) {
    blockers.push("Fill in GCash account name and mobile number.");
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{venue.status === "pending_review" ? "Submitted for review" : "Submit for review"}</CardTitle>
        <CardDescription>
          {venue.status === "pending_review"
            ? "We're reviewing your venue. We'll let you know once it's live."
            : "When everything looks good, submit your venue. Our team will review and publish it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state && !state.ok && (
          <Alert variant="danger" className="mb-3">
            {state.message}
          </Alert>
        )}
        {state?.ok && (
          <Alert variant="success" className="mb-3">
            Status updated.
          </Alert>
        )}
        {blockers.length > 0 && venue.status === "draft" && (
          <Alert variant="warning" title="Before you submit" className="mb-3">
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Alert>
        )}

        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="venueId" value={venue.id} />
          <input type="hidden" name="expectedVersion" value={venue.version} />
          {venue.status === "draft" ? (
            <Button
              type="submit"
              name="action"
              value="submit_for_review"
              disabled={!canSubmit || isPending}
              aria-busy={isPending}
            >
              <Send className="size-4" /> {isPending ? "Submitting…" : "Submit for review"}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="outline"
              name="action"
              value="save_draft"
              disabled={isPending}
              aria-busy={isPending}
            >
              <Undo2 className="size-4" /> {isPending ? "Working…" : "Move back to draft"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
