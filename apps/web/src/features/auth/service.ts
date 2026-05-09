import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AuthError } from "./errors";
import {
  signInInputSchema,
  signUpInputSchema,
  type SignInInput,
  type SignUpInput,
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
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
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
