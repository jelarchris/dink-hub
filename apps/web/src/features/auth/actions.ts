"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import {
  TURNSTILE_FIELD_NAME,
  getClientIp,
  verifyTurnstileToken,
} from "@/lib/turnstile";
import { AuthError, isAuthError } from "./errors";
import * as authService from "./service";

/**
 * Standard server-action result shape. UI consumers `if (result.ok)` then
 * read `data`, otherwise render `errors`.
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

function toResult(err: unknown): ActionResult<never> {
  if (isAuthError(err)) {
    const result: ActionResult<never> = { ok: false, code: err.code, message: err.message };
    if (err.fieldErrors !== undefined) {
      return { ...result, fieldErrors: err.fieldErrors };
    }
    return result;
  }
  console.error("[auth-action] unexpected error", err);
  return { ok: false, code: "unknown", message: "Something went wrong. Please try again." };
}

function s(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Pre-flight check shared by signup/signin: enforce per-IP rate limit,
 * then verify the Turnstile token. Returns a typed error result if either
 * gate fails, otherwise null to continue. Identifier falls back to a static
 * string so abusers cannot bypass the limiter by stripping forwarding
 * headers — they would all share the same bucket.
 */
async function preflightAuthGate(form: FormData): Promise<ActionResult<never> | null> {
  const h = await headers();
  const ip = getClientIp(h);
  const rl = await checkRateLimit(limiters.auth, `auth:${ip ?? "unknown"}`);
  if (!rl.allowed) {
    return { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) };
  }
  const token = s(form, TURNSTILE_FIELD_NAME);
  const cap = await verifyTurnstileToken(token, ip);
  if (!cap.success) {
    return {
      ok: false,
      code: "captcha_failed",
      message: "Security check failed — please retry.",
    };
  }
  return null;
}

export async function signUpAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const gate = await preflightAuthGate(form);
  if (gate) return gate;
  try {
    const role = s(form, "role");
    const result = await authService.signUp({
      displayName: s(form, "displayName"),
      email: s(form, "email"),
      password: s(form, "password"),
      role: role === "venue_owner" ? "venue_owner" : "player",
    });
    if (!result.needsConfirmation) {
      revalidatePath("/", "layout");
    }
    return { ok: true, data: result };
  } catch (err) {
    return toResult(err);
  }
}

export async function signInAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const gate = await preflightAuthGate(form);
  if (gate) return gate;
  let redirectTo: string | null = null;
  try {
    await authService.signIn({ email: s(form, "email"), password: s(form, "password") });
    revalidatePath("/", "layout");
    const next = s(form, "next");
    redirectTo = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  } catch (err) {
    return toResult(err);
  }
  if (redirectTo) redirect(redirectTo);
  // Unreachable, but TypeScript needs a return path
  throw new AuthError("unknown", "redirect failed");
}

export async function signOutAction(): Promise<void> {
  await authService.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
