import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { captureException } from "@/lib/observability";

export interface GuestPlayerInput {
  email: string;
  displayName: string;
  phoneE164: string;
}

export interface GuestPlayerResolution {
  /** profiles.id (also auth.users.id). */
  id: string;
  /** True if we just created the auth user + profile row in this call. */
  isNew: boolean;
  /** True if the existing profile was created via guest checkout (no password yet). */
  isGuest: boolean;
}

export class GuestCheckoutError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "GuestCheckoutError";
  }
}

/**
 * Look up a profile by email. If absent, silently create an auth user via
 * the service-role admin API and insert a matching profile row marked
 * `signup_method='guest_magic_link'`. The booking flow then proceeds with
 * the returned id as `playerId` — every downstream feature (RLS, ledger,
 * notifications, no-show tracking, /me/bookings) keeps working unchanged
 * because the booking is owned by a real auth user.
 *
 * Why service-role: profiles.id must equal auth.users.id (Supabase
 * convention + FK). We need the admin API to create the auth user without
 * a password, then we insert the profile row ourselves. RLS is bypassed
 * intentionally — this function is server-only and only called from the
 * guest checkout path which already validated venue.allow_guest_checkout.
 *
 * Idempotency: keyed on email. Re-running with the same email returns the
 * existing row instead of duplicating. If a row exists but was created via
 * password sign-up we still return it (the booking will still attach to
 * the right account); the caller decides whether to send a magic link or
 * a "log in to see your booking" prompt instead.
 */
export async function resolveOrCreateGuestPlayer(
  input: GuestPlayerInput,
): Promise<GuestPlayerResolution> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const phoneE164 = input.phoneE164.trim();

  if (!email) throw new GuestCheckoutError("validation_failed", "email is required");
  if (!displayName) throw new GuestCheckoutError("validation_failed", "displayName is required");

  // Fast path: profile already exists. Return it and let the caller decide
  // whether to send a magic link.
  const existing = await db
    .select({
      id: profiles.id,
      signupMethod: profiles.signupMethod,
    })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  const existingRow = existing[0];
  if (existingRow) {
    return {
      id: existingRow.id,
      isNew: false,
      isGuest: existingRow.signupMethod === "guest_magic_link",
    };
  }

  // No profile — create the auth user via service-role admin API. We mark
  // `email_confirm: true` so the user can receive the magic link and sign
  // in without an extra verification step (their email is implicitly
  // verified by the fact that the magic link itself can only reach the
  // inbox they typed).
  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      ...(phoneE164 ? { phone_e164: phoneE164 } : {}),
      signup_source: "guest_checkout",
    },
  });

  if (error || !data.user) {
    // Race: another concurrent booking just created the same email. Re-read
    // and use whatever's there. If still nothing, surface the error.
    const raced = await db
      .select({ id: profiles.id, signupMethod: profiles.signupMethod })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1);
    const racedRow = raced[0];
    if (racedRow) {
      return {
        id: racedRow.id,
        isNew: false,
        isGuest: racedRow.signupMethod === "guest_magic_link",
      };
    }
    captureException(error ?? new Error("createUser returned no user"), {
      scope: "guest.createUser",
      extra: { email },
    });
    throw new GuestCheckoutError(
      "guest_account_failed",
      "Could not create a guest account. Please try again or sign in.",
    );
  }

  const authUserId = data.user.id;

  // Insert the profile row. If a profile already exists (e.g. trigger-created
  // by Supabase auth schema), `onConflictDoNothing` makes this safe.
  try {
    await db
      .insert(profiles)
      .values({
        id: authUserId,
        email,
        displayName,
        ...(phoneE164 ? { phoneE164 } : {}),
        signupMethod: "guest_magic_link",
      })
      .onConflictDoNothing({ target: profiles.id });
  } catch (err) {
    captureException(err, { scope: "guest.insertProfile", extra: { email, authUserId } });
    throw new GuestCheckoutError(
      "guest_account_failed",
      "Could not finalise your guest account. Please try again.",
    );
  }

  return { id: authUserId, isNew: true, isGuest: true };
}

/**
 * Generate a one-time magic sign-in link for a guest player and return the
 * full URL the player should click. Wraps the Supabase admin
 * `generateLink({ type: 'magiclink' })` call.
 *
 * Returns `null` on any error (we don't want a failing magic-link to block
 * the booking confirmation — the booking is already saved and the player can
 * still pay via the URL they're about to be redirected to).
 */
export async function generateMagicSignInLink(
  email: string,
  redirectPath: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const redirectTo = new URL(redirectPath, env.NEXT_PUBLIC_APP_URL).toString();
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error || !data.properties?.action_link) {
      captureException(error ?? new Error("generateLink returned no link"), {
        scope: "guest.generateMagicLink",
        extra: { email },
      });
      return null;
    }
    return data.properties.action_link;
  } catch (err) {
    captureException(err, { scope: "guest.generateMagicLink", extra: { email } });
    return null;
  }
}
