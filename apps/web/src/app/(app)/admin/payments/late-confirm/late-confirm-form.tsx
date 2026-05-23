"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { type ActionResult } from "@/features/auth";
import { lateConfirmPaymentAction } from "@/features/booking/late-confirm-actions";

export interface LateConfirmFormProps {
  paymentId: string;
}

export function LateConfirmForm({ paymentId }: LateConfirmFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, action] = useActionState<ActionResult | null, FormData>(
    lateConfirmPaymentAction,
    null,
  );

  useEffect(() => {
    if (state?.ok === true) {
      startTransition(() => router.refresh());
    }
  }, [state, router, startTransition]);

  if (state?.ok === true) {
    return (
      <Alert variant="success" icon={<Check />}>
        Payment late-confirmed. Player and owner notified.
      </Alert>
    );
  }

  const error = state && !state.ok ? state.message : null;
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <FormField
        id={`late-reason-${paymentId}`}
        label="Late-confirm reason (audit trail)"
        error={fieldErrors?.reason?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="reason"
            type="text"
            required
            placeholder="e.g. Owner unresponsive, player confirmed receipt by email"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>
      {error && <Alert variant="danger">{error}</Alert>}
      <div>
        <SubmitButton variant="destructive" pendingLabel="Confirming">
          <ShieldAlert className="size-4" /> Late-confirm payment
        </SubmitButton>
      </div>
    </form>
  );
}
