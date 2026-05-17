import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { captureException } from "@/lib/observability";
import { AuthError } from "./errors";
import {
  requestPasswordResetInputSchema,
  signInInputSchema,
  signUpInputSchema,
  updatePasswordInputSchema,
  type RequestPasswordResetInput,
  type SignInInput,
  type SignUpInput,
  type UpdatePasswordInput,
} from "./schema";

/**
 * Auth service — wraps Supabase Auth with typed errors and Zod validation.
 * Profile rows are auto-created by the on_auth_user_created DB trigger,
 * so we never insert into profiles from here.
 */

function mapSupabaseError(message: string, status: number | undefined): AuthError {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return new AuthError("invalid_credentials", "Email or password is incorrect");
  }
  if (m.includes("already registered") || m.includes("user already")) {
    return new AuthError("email_taken", "An account with this email already exists");
  }
  if (m.includes("rate limit") || status === 429) {
    return new AuthError("rate_limited", "Too many attempts. Please wait a moment and try again.");
  }
  if (m.includes("email not confirmed")) {
    return new AuthError("email_not_confirmed", "Please confirm your email before signing in");
  }
  return new AuthError("unknown", "Something went wrong. Please try again.");
}

export async function signUp(input: SignUpInput): Promise<{ userId: string; needsConfirmation: boolean }> {
  const parsed = signUpInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError("validation_failed", "Please check the form", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  // emailRedirectTo: where Supabase sends the user after they click the
  // confirmation link. Without this, Supabase falls back to its dashboard
  // "Site URL" which may be wrong (e.g. localhost) and the verification link
  // lands on the wrong host. Always pin it to our canonical app URL.
  const emailRedirectTo = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/sign-in`;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
      data: {
        display_name: parsed.data.displayName,
        role: parsed.data.role,
      },
    },
  });

  if (error || !data.user) {
    throw mapSupabaseError(error?.message ?? "signup failed", error?.status);
  }

  return {
    userId: data.user.id,
    // If email confirmation is enabled, session will be null
    needsConfirmation: data.session === null,
  };
}

export async function signIn(input: SignInInput): Promise<{ userId: string }> {
  const parsed = signInInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError("validation_failed", "Please check the form", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    throw mapSupabaseError(error?.message ?? "sign in failed", error?.status);
  }

  return { userId: data.user.id };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Read the current user from the session cookie.
 * Always uses getUser() (not getSession()) which validates the JWT server-side.
 * Returns null when not signed in.
 */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !data.user.email) return null;
  return { id: data.user.id, email: data.user.email };
}

/**
 * Generate a Supabase recovery link via the admin API and dispatch a branded
 * email through Resend. Always succeeds from the caller's perspective so we
 * don't leak whether an email exists in the system (account-enumeration
 * defense). Real errors are captured to Sentry.
 */
export async function requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
  const parsed = requestPasswordResetInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError(
      "validation_failed",
      "Please check the form",
      parsed.error.flatten().fieldErrors,
    );
  }

  const redirectTo = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/reset-password`;
  const admin = createServiceClient();

  // generateLink does NOT send the email itself when admin API is used — we
  // get back the action_link to embed in our own message.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data.email,
    options: { redirectTo },
  });

  // Treat "user not found" as a no-op success — never confirm account
  // existence to the caller.
  if (error) {
    const status = (error as { status?: number }).status;
    const msg = error.message.toLowerCase();
    if (status === 404 || msg.includes("not found") || msg.includes("user_not_found")) {
      return;
    }
    captureException(error, { scope: "auth.requestPasswordReset" });
    // Generic failure shape — do not echo Supabase internals.
    throw new AuthError("unknown", "Could not send reset email. Please try again.");
  }

  const actionLink = data.properties?.action_link;
  if (!actionLink) {
    captureException(new Error("generateLink returned no action_link"), {
      scope: "auth.requestPasswordReset",
    });
    return;
  }

  const displayName =
    typeof data.user?.user_metadata?.display_name === "string"
      ? (data.user.user_metadata.display_name as string)
      : parsed.data.email.split("@")[0]!;

  const tpl = passwordResetEmail({ displayName, resetUrl: actionLink });
  const result = await sendEmail({
    to: parsed.data.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tag: "password_reset",
  });
  if (!result.ok) {
    captureException(new Error(`password reset email failed: ${result.error}`), {
      scope: "auth.requestPasswordReset",
    });
  }
}

/**
 * Update the signed-in user's password. Requires an active recovery session
 * (set client-side from the magic-link hash) — Supabase enforces this.
 */
export async function updatePassword(input: UpdatePasswordInput): Promise<void> {
  const parsed = updatePasswordInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthError(
      "validation_failed",
      "Please check the form",
      parsed.error.flatten().fieldErrors,
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new AuthError(
      "session_expired",
      "Your reset link has expired. Please request a new one.",
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.message.toLowerCase().includes("same") || (error as { code?: string }).code === "same_password") {
      throw new AuthError(
        "validation_failed",
        "Choose a password different from your current one",
        { password: ["Choose a different password"] },
      );
    }
    throw new AuthError("unknown", "Could not update your password. Please try again.");
  }

  // Sign out so the user must log in again with the new password.
  await supabase.auth.signOut();
}
