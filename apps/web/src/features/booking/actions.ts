"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelBooking,
  createBooking,
  holdSlot,
  releaseHold,
} from "@/features/booking/service";
import { isBookingError } from "@/features/booking/errors";
import { getCurrentUser } from "@/features/auth/service";
import { type ActionResult } from "@/features/auth";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";

const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const startBookingSchema = z.object({
  courtId: z.string().uuid(),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  venueSlug: z.string().min(1),
});

const cancelSchema = z.object({ bookingId: z.string().uuid() });

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isBookingError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  console.error("[booking-action]", err);
  return fail("Something went wrong. Please try again.");
}

/**
 * Hold the slot, immediately create a pending_payment booking, and redirect
 * the player to the payment screen. Single round-trip from the slot picker.
 */
export async function startBookingAction(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(`/venues/${(form.get("venueSlug") as string) ?? ""}`);
    redirect(`/sign-in?next=${next}`);
  }

  // Rate limit booking creation per user. CAPTCHA is intentionally NOT used
  // here: the slot picker renders one <form> per slot which makes a single
  // shared Turnstile widget impractical. The flow is auth-gated and the
  // database EXCLUDE constraint guarantees no double-bookings, so per-user
  // rate limiting is the proportional defense against abuse.
  const rl = await checkRateLimit(limiters.bookingCreate, `booking:${user.id}`);
  if (!rl.allowed) {
    return { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) };
  }

  const parsed = startBookingSchema.safeParse({
    courtId: form.get("courtId"),
    startAt: form.get("startAt"),
    endAt: form.get("endAt"),
    venueSlug: form.get("venueSlug"),
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  let bookingId: string;
  try {
    const hold = await holdSlot({
      playerId: user.id,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
    });
    const booking = await createBooking({
      playerId: user.id,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      holdId: hold.id,
    });
    bookingId = booking.id;
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath(`/venues/${parsed.data.venueSlug}`);
  redirect(`/book/${bookingId}/pay`);
}

export async function cancelBookingAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Not signed in", "not_authorized");

  const parsed = cancelSchema.safeParse({ bookingId: form.get("bookingId") });
  if (!parsed.success) return fail("Invalid input", "validation_failed");

  try {
    await cancelBooking({ bookingId: parsed.data.bookingId, playerId: user.id });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath("/me/bookings");
  return { ok: true, data: null };
}

/**
 * Form-action friendly variant of startBookingAction. Returns void so it
 * can be used directly in `<form action={...}>` from client components without
 * type complaints. On success it redirects; on validation/business errors it
 * just doesn't redirect — caller can rely on revalidation to surface the new state.
 */
export async function startBookingFormAction(form: FormData): Promise<void> {
  await startBookingAction(form);
}

export async function releaseHoldAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = form.get("holdId");
  if (typeof id !== "string") return;
  try {
    await releaseHold({ holdId: id, playerId: user.id });
  } catch {
    // best-effort cleanup
  }
}
