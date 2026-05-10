"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updatePasswordAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

type LinkState = "checking" | "valid" | "invalid";

function readInitialLinkState(): LinkState {
  if (typeof window === "undefined") return "checking";
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  if (
    hash.get("error_code") ||
    search.get("error_code") ||
    hash.get("error_description") ||
    search.get("error_description")
  ) {
    return "invalid";
  }
  return "checking";
}

function ResetHeader({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <header className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-muted)]">{kicker}</p>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--color-fg-muted)]">{description}</p>
    </header>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>(readInitialLinkState);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  useEffect(() => {
    if (linkState !== "checking") return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (error) {
          setLinkState("invalid");
          return;
        }
        setLinkState("valid");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        setLinkState("invalid");
      } else {
        setLinkState("valid");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkState]);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/sign-in"), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state, router]);

  if (linkState === "checking") {
    return <ResetHeader kicker="Reset password" title="Checking your link" description="One moment…" />;
  }

  if (linkState === "invalid") {
    return (
      <div className="space-y-4">
        <ResetHeader
          kicker="Reset password"
          title="This link won't work"
          description="The reset link is expired or has already been used."
        />
        <Link href="/forgot-password">
          <Button size="lg" className="w-full">
            Request a new link
          </Button>
        </Link>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <ResetHeader
        kicker="Reset password"
        title="Password updated"
        description="You're being sent to the sign-in page…"
      />
    );
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;

  return (
    <div className="space-y-5">
      <ResetHeader
        kicker="Reset password"
        title="Choose a new password"
        description="At least 8 characters with letters and a number."
      />
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <FormField id="password" label="New password" error={fieldErrors?.password?.[0]}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <SubmitButton size="lg" pendingLabel="Updating" className="mt-1">
          Update password
        </SubmitButton>
      </form>
    </div>
  );
}
