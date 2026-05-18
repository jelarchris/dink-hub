"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cancelSignupAction } from "@/features/open-play/actions";
import type { ActionResult } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

export function CancelSignupButton({ signupId }: { signupId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    cancelSignupAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      startTransition(() => router.refresh());
    }
  }, [state, router]);

  // After success the parent will re-fetch and likely unmount us; render nothing in the meantime.
  if (state?.ok) {
    return null;
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <X className="size-3.5" /> Cancel
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="signupId" value={signupId} />
      {state && !state.ok && (
        <Alert variant="danger" className="mr-2 py-1 text-xs">
          {state.message}
        </Alert>
      )}
      <SubmitButton variant="destructive" size="sm" pendingLabel="Cancelling…">
        Confirm cancel
      </SubmitButton>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Keep
      </Button>
    </form>
  );
}
