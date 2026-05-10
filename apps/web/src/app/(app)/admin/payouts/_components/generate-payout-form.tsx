"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { generatePayoutAction } from "@/features/admin";
import type { ActionResult } from "@/features/auth";

interface Props {
  venues: ReadonlyArray<{ id: string; name: string; ownerEmail: string }>;
}

export function GeneratePayoutForm({ venues }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    generatePayoutAction,
    null,
  );

  // Default period: previous calendar week (Mon–Sun) ending yesterday.
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const start = new Date(yesterday);
  start.setUTCDate(yesterday.getUTCDate() - 6);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-semibold">Generate payout</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">
            Aggregates confirmed bookings whose start time falls in the period.
          </p>
        </div>

        {venues.length === 0 ? (
          <Alert variant="info" className="text-xs">
            No active venues found.
          </Alert>
        ) : (
          <form action={formAction} className="space-y-3">
            <div>
              <label
                htmlFor="payout-venue"
                className="block text-xs font-medium text-[var(--color-fg-muted)]"
              >
                Venue
              </label>
              <Select id="payout-venue" name="venueId" required className="mt-1">
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.ownerEmail}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="payout-start"
                  className="block text-xs font-medium text-[var(--color-fg-muted)]"
                >
                  Period start
                </label>
                <Input
                  id="payout-start"
                  type="date"
                  name="periodStart"
                  defaultValue={fmt(start)}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label
                  htmlFor="payout-end"
                  className="block text-xs font-medium text-[var(--color-fg-muted)]"
                >
                  Period end (excl.)
                </label>
                <Input
                  id="payout-end"
                  type="date"
                  name="periodEnd"
                  defaultValue={fmt(today)}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="payout-notes"
                className="block text-xs font-medium text-[var(--color-fg-muted)]"
              >
                Notes (optional)
              </label>
              <Textarea
                id="payout-notes"
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

            <SubmitButton size="sm" pendingLabel="Generating" className="w-full">
              Generate payout
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
