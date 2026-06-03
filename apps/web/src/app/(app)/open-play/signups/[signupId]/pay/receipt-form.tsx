"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { submitSignupReceiptAction } from "@/features/open-play/actions";
import type { ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatPHP } from "@/lib/money";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export interface OpenPlayReceiptFormProps {
  signupId: string;
  totalCentavos: bigint;
  gcashAccountName: string | null;
  gcashAccountNumber: string | null;
}

export function OpenPlayReceiptForm({
  signupId,
  totalCentavos,
  gcashAccountName,
  gcashAccountNumber,
}: OpenPlayReceiptFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    submitSignupReceiptAction,
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmDetail, setConfirmDetail] = useState(false);
  const [confirmTerms, setConfirmTerms] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;
  const success = state?.ok === true;

  useEffect(() => {
    if (!success) return;
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition, success]);

  function onPick() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setFileName(null);
      setFileError(null);
      return;
    }
    if (!ALLOWED.includes(f.type)) {
      setFileError("Use a JPEG, PNG or WebP image");
      setFileName(f.name);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("File must be 5 MB or smaller");
      setFileName(f.name);
      return;
    }
    setFileError(null);
    setFileName(f.name);
  }

  if (success) {
    return (
      <Alert variant="success" icon={<Check />} title="Receipt uploaded">
        Waiting for the venue owner to verify. Refresh in a moment to see your status update.
      </Alert>
    );
  }

  const canSubmit = fileName !== null && !fileError && confirmDetail && confirmTerms;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="signupId" value={signupId} />

      {/* Pay exactly banner */}
      <div className="rounded-[var(--radius-md)] bg-[var(--color-brand-700)] px-4 py-4 text-center text-white">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">
          PAY EXACTLY
        </p>
        <p className="text-3xl font-extrabold tabular-nums tracking-tight">
          {formatPHP(totalCentavos)}
        </p>
        <p className="mt-1 text-xs opacity-70">
          Incorrect payment amounts may delay your signup confirmation
        </p>
      </div>

      {/* Send payment to */}
      {gcashAccountNumber ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">
            Send Payment To
          </p>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-base font-bold tabular-nums">{gcashAccountNumber}</p>
              {gcashAccountName && (
                <p className="text-xs text-[var(--color-fg-muted)]">{gcashAccountName}</p>
              )}
            </div>
            <CopyButton value={gcashAccountNumber} label="GCash number" />
          </div>
        </div>
      ) : (
        <Alert variant="warning">
          GCash number not set up yet. Contact the venue directly for payment instructions.
        </Alert>
      )}

      {formError && <Alert variant="danger">{formError}</Alert>}

      {/* Payment proof */}
      <FormField
        id="receipt"
        label="Payment Proof"
        hint="JPEG, PNG or WebP · max 5 MB"
        error={fileError ?? fieldErrors?.receipt?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <label
            htmlFor={id}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed px-4 py-6 text-sm transition-colors",
              invalid
                ? "border-[var(--color-danger-500)] bg-[var(--color-danger-50)]"
                : "border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)]",
            )}
          >
            <Upload className="size-6 text-[var(--color-fg-muted)]" />
            <span className="font-medium">{fileName ?? "Tap to upload GCash receipt"}</span>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {fileName ? "Tap again to choose a different file" : "Screenshot or photo of payment"}
            </span>
            <input
              id={id}
              ref={fileRef}
              type="file"
              name="receipt"
              accept={ALLOWED.join(",")}
              required
              onChange={onPick}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="sr-only"
            />
          </label>
        )}
      </FormField>

      {/* GCash sender mobile (required) */}
      <FormField
        id="gcashSenderMobile"
        label="GCash mobile number"
        hint="The number you sent from (e.g. 09171234567)"
        error={fieldErrors?.gcashSenderMobile?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="gcashSenderMobile"
            type="tel"
            inputMode="numeric"
            placeholder="e.g. 09171234567"
            required
            minLength={11}
            maxLength={11}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      {/* GCash reference (required) */}
      <FormField
        id="gcashReferenceNumber"
        label="GCash Reference Number"
        hint="Required — find this in your GCash receipt"
        error={fieldErrors?.gcashReferenceNumber?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="gcashReferenceNumber"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1234567890"
            required
            minLength={6}
            maxLength={20}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      {/* Confirmation checkboxes */}
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmDetail}
            onChange={(e) => setConfirmDetail(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-500)]"
          />
          <span className="text-xs text-[var(--color-fg)]">
            I have reviewed my signup details and confirm they are correct. I understand this
            signup is <strong>final and cannot be modified.</strong>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmTerms}
            onChange={(e) => setConfirmTerms(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-500)]"
          />
          <span className="text-xs text-[var(--color-fg)]">
            I understand this signup is <strong>non-refundable.</strong> I have sent the exact
            amount to the GCash number shown above and will only upload a valid receipt for this
            transaction.
          </span>
        </label>
      </div>

      <SubmitButton
        disabled={!canSubmit}
        pendingLabel="Submitting…"
        className="py-3 text-sm font-semibold"
      >
        <Check className="size-4" aria-hidden />
        Submit Signup
      </SubmitButton>
    </form>
  );
}
