"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { submitReceiptAction } from "@/features/booking/payment-actions";
import type { ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function ReceiptUploadForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    submitReceiptAction,
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // captchaSolved is intentionally NOT used to gate the submit button.
  // The interaction-only Turnstile widget injects cf-turnstile-response into
  // the form silently; the server validates it and returns a clear error if
  // the token is missing, preventing the "frozen disabled button" UX trap.
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

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />

      {formError && <Alert variant="danger">{formError}</Alert>}

      <FormField id="receipt" label="Receipt image" hint="JPEG, PNG or WebP · max 5 MB" error={fileError ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <label
            htmlFor={id}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed px-4 py-8 text-sm transition-colors " +
              (invalid
                ? "border-[var(--color-danger-500)] bg-[var(--color-danger-50)]"
                : "border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)]")
            }
          >
            <Upload className="size-6 text-[var(--color-fg-muted)]" />
            <span className="font-medium">{fileName ?? "Tap to select your GCash receipt"}</span>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {fileName ? "Tap again to choose a different file" : "Or drag-and-drop here"}
            </span>
            <Input
              id={id}
              ref={fileRef}
              type="file"
              name="receipt"
              accept={ALLOWED.join(",")}
              required
              onChange={onPick}
              aria-describedby={describedBy}
              invalid={invalid}
              className="sr-only"
            />
          </label>
        )}
      </FormField>

      <FormField
        id="gcashReferenceNumber"
        label="GCash reference number"
        hint="Optional, but speeds up verification"
        error={fieldErrors?.gcashReferenceNumber?.[0]}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="gcashReferenceNumber"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1234567890"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      <SubmitButton
        size="lg"
        pendingLabel="Uploading"
        disabled={Boolean(fileError)}
        className="mt-2"
      >
        Submit receipt
      </SubmitButton>

    </form>
  );
}
