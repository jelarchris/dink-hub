"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { rejectPaymentAction, verifyPaymentAction } from "@/features/booking/payment-actions";
import type { ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatPHP } from "@/lib/money";
import { formatDateTimeManila } from "@/lib/date";

export interface PaymentReviewCardProps {
  paymentId: string;
  amountCentavosStr: string;
  expectedTotalCentavosStr: string;
  gcashReferenceNumber: string | null;
  submittedAtIso: string;
  startAtIso: string;
  endAtIso: string;
  venueName: string;
  courtName: string;
  playerName: string;
  receiptUrl: string | null;
}

export function PaymentReviewCard(props: PaymentReviewCardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [verifyState, verifyAction, verifyPending] = useActionState<ActionResult | null, FormData>(
    verifyPaymentAction,
    null,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult | null, FormData>(
    rejectPaymentAction,
    null,
  );

  const expected = BigInt(props.expectedTotalCentavosStr);
  const submitted = BigInt(props.amountCentavosStr);
  const amountMismatch = expected !== submitted;
  const actionSucceeded = verifyState?.ok === true || rejectState?.ok === true;

  useEffect(() => {
    if (!actionSucceeded) return;
    startTransition(() => {
      router.refresh();
    });
  }, [actionSucceeded, router, startTransition]);

  if (actionSucceeded) {
    return (
      <Alert variant="success" icon={<Check />}>
        {verifyState?.ok ? "Payment verified" : "Payment rejected"}.
      </Alert>
    );
  }

  const error =
    (verifyState && !verifyState.ok ? verifyState.message : null) ??
    (rejectState && !rejectState.ok ? rejectState.message : null);
  const rejectFieldErrors = rejectState && !rejectState.ok ? rejectState.fieldErrors : undefined;

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[200px_1fr]">
        {/* Receipt thumbnail */}
        <div>
          {props.receiptUrl ? (
            <a
              href={props.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.receiptUrl}
                alt="GCash receipt"
                className="h-full max-h-[260px] w-full object-contain"
              />
            </a>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-[var(--radius-md)] border border-dashed text-xs text-[var(--color-fg-muted)]">
              Receipt unavailable
            </div>
          )}
        </div>

        {/* Details + actions */}
        <div className="space-y-3">
          <div>
            <div className="font-semibold">{props.venueName} · {props.courtName}</div>
            <div className="text-sm text-[var(--color-fg-muted)]">
              {formatDateTimeManila(new Date(props.startAtIso))} → {formatDateTimeManila(new Date(props.endAtIso))}
            </div>
            <div className="text-sm text-[var(--color-fg-muted)]">
              Player: <strong className="text-[var(--color-fg)]">{props.playerName}</strong>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-[var(--color-fg-muted)]">Expected</dt>
              <dd className="font-semibold">{formatPHP(expected)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-fg-muted)]">Receipt amount</dt>
              <dd
                className={
                  "font-semibold " +
                  (amountMismatch ? "text-[var(--color-danger-500)]" : "")
                }
              >
                {formatPHP(submitted)}
                {amountMismatch && <span className="ml-1 text-xs">⚠ mismatch</span>}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[var(--color-fg-muted)]">GCash reference</dt>
              <dd className="font-mono text-xs">
                {props.gcashReferenceNumber ?? <span className="italic text-[var(--color-fg-muted)]">none provided</span>}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[var(--color-fg-muted)]">Submitted</dt>
              <dd>{formatDateTimeManila(new Date(props.submittedAtIso))}</dd>
            </div>
          </dl>

          {amountMismatch && (
            <Alert variant="warning">
              Receipt amount ({formatPHP(submitted)}) does not match expected total ({formatPHP(expected)}). Verify carefully or reject if incorrect.
            </Alert>
          )}

          {error && <Alert variant="danger">{error}</Alert>}

          {mode === "idle" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <form action={verifyAction}>
                <input type="hidden" name="paymentId" value={props.paymentId} />
                <SubmitButton pendingLabel="Verifying">
                  <Check className="size-4" /> Verify payment
                </SubmitButton>
              </form>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("rejecting")}
                disabled={verifyPending}
              >
                <X className="size-4" /> Reject
              </Button>
            </div>
          ) : (
            <form action={rejectAction} className="flex flex-col gap-2 pt-1">
              <input type="hidden" name="paymentId" value={props.paymentId} />
              <FormField id={`reason-${props.paymentId}`} label="Reason for rejection" error={rejectFieldErrors?.reason?.[0]}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="reason"
                    type="text"
                    required
                    placeholder="e.g. Amount doesn't match"
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              </FormField>
              <div className="flex gap-2">
                <SubmitButton variant="destructive" pendingLabel="Rejecting">
                  Confirm reject
                </SubmitButton>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setMode("idle")}
                  disabled={rejectPending}
                >
                  Back
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
