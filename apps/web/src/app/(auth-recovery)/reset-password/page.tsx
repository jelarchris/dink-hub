"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updatePasswordAction, type ActionResult } from "@/features/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>(readInitialLinkState);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  // Verify the recovery session that the browser supabase client installed
  // from the URL hash. Skip when the URL already carried an error.
  useEffect(() => {
    if (linkState !== "checking") return;
    let cancelled = false;
    const supabase = createClient();
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user) {
        setLinkState("invalid");
      } else {
        setLinkState("valid");
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [linkState]);

  // After successful update the server action signs the user out.
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/sign-in"), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state, router]);

  if (linkState === "checking") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Checking your link</CardTitle>
          <CardDescription>One moment&hellip;</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (linkState === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link won&apos;t work</CardTitle>
          <CardDescription>
            The reset link is expired or has already been used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="/forgot-password">
            <Button size="lg" className="w-full">
              Request a new link
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (state?.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password updated</CardTitle>
          <CardDescription>
            You&apos;re being sent to the sign-in page&hellip;
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && state.code !== "validation_failed" ? state.message : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Pick something at least 8 characters with letters and a number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          {formError && <Alert variant="danger">{formError}</Alert>}

          <FormField
            id="password"
            label="New password"
            error={fieldErrors?.password?.[0]}
          >
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

          <SubmitButton size="lg" pendingLabel="Updating" className="mt-2">
            Update password
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
