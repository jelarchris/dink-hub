"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import {
  cancelSessionAction,
  publishSessionAction,
  rejectSignupPaymentAction,
  verifySignupPaymentAction,
} from "@/features/open-play/actions";
import type { ActionResult } from "@/features/auth";

/** Publish a draft session. Refreshes the page on success. */
export function PublishButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const res = await publishSessionAction(prev, form);
      if (res.ok) router.refresh();
      return res;
    },
    null,
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      {state && !state.ok && <Alert variant="danger">{state.message}</Alert>}
      <SubmitButton size="md" pendingLabel="Publishing…">
        <Send className="size-4" /> Publish session
      </SubmitButton>
    </form>
  );
}

/** Cancel a session — opens a confirmation panel for the reason. */
export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const res = await cancelSessionAction(prev, form);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
      return res;
    },
    null,
  );

  if (!open) {
    return (
      <Button variant="outline" size="md" onClick={() => setOpen(true)} className="w-full">
        <X className="size-4" /> Cancel session
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      {state && !state.ok && <Alert variant="danger">{state.message}</Alert>}
      <FormField id="reason" label="Reason (shared with players)">
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="reason"
            rows={2}
            maxLength={500}
            placeholder="e.g. Court damage — sorry for the trouble"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>
      <div className="flex gap-2">
        <SubmitButton variant="destructive" size="sm" pendingLabel="Cancelling…">
          Confirm cancel
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep session
        </Button>
      </div>
    </form>
  );
}

export function VerifyPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const res = await verifySignupPaymentAction(prev, form);
      if (res.ok) router.refresh();
      return res;
    },
    null,
  );
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="paymentId" value={paymentId} />
      <SubmitButton size="sm" pendingLabel="…" title={state && !state.ok ? state.message : undefined}>
        <Check className="size-3.5" /> Verify
      </SubmitButton>
    </form>
  );
}

export function RejectPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const res = await rejectSignupPaymentAction(prev, form);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
      return res;
    },
    null,
  );

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <X className="size-3.5" /> Reject
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input
        name="reason"
        type="text"
        required
        maxLength={500}
        placeholder="Reason (e.g. wrong amount)"
        className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg)] px-2 text-xs"
      />
      <SubmitButton variant="destructive" size="sm" pendingLabel="…">
        Confirm
      </SubmitButton>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state && !state.ok && (
        <span className="text-[11px] text-[var(--color-danger-700)]">{state.message}</span>
      )}
    </form>
  );
}
