"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelBooking,
  createBooking,
  rebookFromClosure,
  releaseHold,
} from "@/features/booking/service";
import { isBookingError } from "@/features/booking/errors";
import { isVoucherError } from "@/features/vouchers/errors";
import { notifyBookingCancelledByPlayer } from "@/features/booking/notifications";
import { getCurrentUser } from "@/features/auth/service";
import { type ActionResult } from "@/features/auth";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import { captureException } from "@/lib/observability";

const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const startBookingSchema = z.object({
  courtId: z.string().uuid(),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  venueSlug: z.string().min(1),
  voucherCode: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
});

const cancelSchema = z.object({ bookingId: z.string().uuid() });

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isBookingError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  if (isVoucherError(err)) {
    return { ok: false, code: `voucher_${err.code}`, message: err.message };
  }
  captureException(err, { scope: "booking.action" });
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

  // Rate limit booking creation per user. The flow is auth-gated and the
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
    voucherCode: form.get("voucherCode") || undefined,
    contactEmail: form.get("contactEmail") || undefined,
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  let bookingId: string;
  try {
    // No separate holdSlot call: createBooking inserts atomically and the
    // bookings EXCLUDE constraint prevents double-bookings at the DB level.
    // Holds only matter when there's a wait between picker and submit; this
    // action commits immediately, so the extra round-trip + court lookup
    // were pure latency.
    const booking = await createBooking({
      playerId: user.id,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      ...(parsed.data.voucherCode ? { voucherCode: parsed.data.voucherCode } : {}),
      ...(parsed.data.contactEmail ? { contactEmail: parsed.data.contactEmail } : {}),
    });
    bookingId = booking.id;
  } catch (err) {
    return unwrap(err);
  }

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
  await notifyBookingCancelledByPlayer(parsed.data.bookingId);
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

/**
 * Like startBookingAction but returns the created booking data instead of
 * redirecting. Used by the multi-step booking modal so the UI can transition
 * from step 1 to step 2 without a page navigation.
 */
export async function startBookingReturningIdAction(
  form: FormData,
): Promise<
  ActionResult<{
    bookingId: string;
    totalCentavos: string;
    courtFeeCentavos: string;
    systemFeeCentavos: string;
    discountCentavos: string;
    voucherCodeSnapshot: string | null;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in to continue", "not_authorized");

  const rl = await checkRateLimit(limiters.bookingCreate, `booking:${user.id}`);
  if (!rl.allowed) return { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) };

  const parsed = startBookingSchema.safeParse({
    courtId: form.get("courtId"),
    startAt: form.get("startAt"),
    endAt: form.get("endAt"),
    venueSlug: form.get("venueSlug"),
    voucherCode: form.get("voucherCode") || undefined,
    contactEmail: form.get("contactEmail") || undefined,
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  try {
    const booking = await createBooking({
      playerId: user.id,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      ...(parsed.data.voucherCode ? { voucherCode: parsed.data.voucherCode } : {}),
      ...(parsed.data.contactEmail ? { contactEmail: parsed.data.contactEmail } : {}),
    });
    return {
      ok: true,
      data: {
        bookingId: booking.id,
        totalCentavos: booking.totalCentavos.toString(),
        courtFeeCentavos: booking.courtFeeCentavos.toString(),
        systemFeeCentavos: booking.systemFeeCentavos.toString(),
        discountCentavos: booking.discountCentavos.toString(),
        voucherCodeSnapshot: booking.voucherCodeSnapshot,
      },
    };
  } catch (err) {
    return unwrap(err);
  }
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

const rebookFromClosureSchema = z.object({
  parentBookingId: z.string().uuid(),
  courtId: z.string().uuid(),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  venueSlug: z.string().min(1),
});

/**
 * Player self-rebook after a venue-closure/weather/court-unavailable
 * cancellation. Auth-gated; rate-limited per user; redirects unauthenticated
 * users back to the rebook URL after sign-in. The DB partial-unique index
 * `bookings_one_active_rebook_per_parent` is the authoritative double-claim
 * guard.
 */
export async function rebookFromClosureAction(
  form: FormData,
): Promise<ActionResult<{ bookingId: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    const slug = (form.get("venueSlug") as string) ?? "";
    const parent = (form.get("parentBookingId") as string) ?? "";
    const next = encodeURIComponent(`/venues/${slug}/book?rebook=${parent}`);
    redirect(`/sign-in?next=${next}`);
  }

  const rl = await checkRateLimit(limiters.bookingCreate, `booking:${user.id}`);
  if (!rl.allowed) {
    return { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) };
  }

  const parsed = rebookFromClosureSchema.safeParse({
    parentBookingId: form.get("parentBookingId"),
    courtId: form.get("courtId"),
    startAt: form.get("startAt"),
    endAt: form.get("endAt"),
    venueSlug: form.get("venueSlug"),
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  try {
    const booking = await rebookFromClosure({
      playerId: user.id,
      parentBookingId: parsed.data.parentBookingId,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
    });
    revalidatePath("/me/bookings");
    return { ok: true, data: { bookingId: booking.id } };
  } catch (err) {
    return unwrap(err);
  }
}
