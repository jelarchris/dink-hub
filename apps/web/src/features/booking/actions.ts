"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import {
  cancelBooking,
  createBooking,
  rebookFromClosure,
  releaseHold,
} from "@/features/booking/service";
import { isBookingError } from "@/features/booking/errors";
import { isVoucherError } from "@/features/vouchers/errors";
import {
  notifyBookingCancelledByPlayer,
  notifyGuestBookingMagicLink,
} from "@/features/booking/notifications";
import { getCurrentUser } from "@/features/auth/service";
import { resolveOrCreateGuestPlayer, GuestCheckoutError } from "@/features/auth/guest";
import { findActiveVenueBySlug } from "@/features/venues";
import { getClientIp } from "@/lib/client-ip";
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
  paymentMode: z.enum(["full", "deposit"]).default("full"),
});

/**
 * Optional guest-checkout block. When present AND no session user, the action
 * silently creates (or reuses) a profile keyed on email and uses its id as
 * playerId. The venue must have allow_guest_checkout = true.
 *
 * displayName / phoneE164 are required because the booking + downstream
 * notifications + owner UX all need a real human identity — anonymous
 * bookings cause too many downstream problems (refunds, no-show tracking,
 * owner trust).
 */
const guestBlockSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+63\d{10}$/, "Use Philippine format: +63XXXXXXXXXX"),
});

const cancelSchema = z.object({ bookingId: z.string().uuid() });

function fail(message: string, code = "unknown"): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (isBookingError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  if (isVoucherError(err)) {
    return { ok: false, code: `voucher_${err.code}`, message: err.message };
  }
  if (err instanceof GuestCheckoutError) {
    return { ok: false, code: err.code, message: err.message };
  }
  captureException(err, { scope: "booking.action" });
  return fail("Something went wrong. Please try again.");
}

/**
 * Resolve the playerId for a booking submission. Three paths:
 *  1. Authenticated session  -> return user.id.
 *  2. No session + venue.allowGuestCheckout + guest block valid
 *     -> resolve or create profile via service-role, return its id.
 *  3. Anything else -> ActionResult error (callers must handle).
 *
 * IP-based rate limit is applied on the guest path (the user-id-keyed
 * limiter doesn't fit — there's no user yet).
 */
async function resolvePlayerForBooking(
  form: FormData,
  venueSlug: string,
):
  Promise<
    | { ok: true; playerId: string; isGuest: boolean; isNewGuest: boolean }
    | { ok: false; error: Extract<ActionResult<never>, { ok: false }> }
  > {
  const user = await getCurrentUser();
  if (user) {
    const rl = await checkRateLimit(limiters.bookingCreate, `booking:${user.id}`);
    if (!rl.allowed) {
      return {
        ok: false,
        error: { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) },
      };
    }
    return { ok: true, playerId: user.id, isGuest: false, isNewGuest: false };
  }

  // Guest path. Venue must opt in.
  const venue = await findActiveVenueBySlug(venueSlug);
  if (!venue) {
    return { ok: false, error: fail("Venue not found", "venue_not_found") };
  }
  if (!venue.venue.allowGuestCheckout) {
    return {
      ok: false,
      error: fail("Please sign in to book at this venue", "guest_checkout_disabled"),
    };
  }

  const parsedGuest = guestBlockSchema.safeParse({
    displayName: form.get("guestName"),
    email: form.get("guestEmail"),
    phoneE164: form.get("guestPhone"),
  });
  if (!parsedGuest.success) {
    const firstIssue = parsedGuest.error.issues[0];
    return {
      ok: false,
      error: fail(firstIssue?.message ?? "Please complete your contact details", "validation_failed"),
    };
  }

  // IP-based rate limit — every guest request silently creates an auth user
  // so we throttle harder than the authenticated path.
  const h = await headers();
  const ip = getClientIp(h) ?? "unknown";
  const rl = await checkRateLimit(limiters.guestBookingCreate, `guest-booking:${ip}`);
  if (!rl.allowed) {
    return {
      ok: false,
      error: { ok: false, code: "rate_limited", message: rateLimitMessage(rl.resetMs) },
    };
  }

  try {
    const resolution = await resolveOrCreateGuestPlayer(parsedGuest.data);
    return {
      ok: true,
      playerId: resolution.id,
      isGuest: true,
      isNewGuest: resolution.isNew,
    };
  } catch (err) {
    return { ok: false, error: unwrap(err) };
  }
}

/**
 * Hold the slot, immediately create a pending_payment booking, and redirect
 * the player to the payment screen. Single round-trip from the slot picker.
 *
 * Supports two callers:
 *  - Authenticated player (legacy): playerId comes from the session.
 *  - Guest player (silent-account checkout): name/email/phone are read from
 *    the form, the profile is resolved or created via service-role, and
 *    a magic-link email is dispatched after the booking is saved.
 */
export async function startBookingAction(form: FormData): Promise<ActionResult> {
  const venueSlug = (form.get("venueSlug") as string) ?? "";
  const resolved = await resolvePlayerForBooking(form, venueSlug);
  if (!resolved.ok) {
    // Auth path: legacy behaviour was to redirect to sign-in. Preserve that
    // when guest checkout is disabled OR fields are missing, so the picker's
    // "Continue" button still has a working fallback.
    if (
      resolved.error.code === "guest_checkout_disabled" ||
      resolved.error.code === "validation_failed"
    ) {
      const next = encodeURIComponent(`/venues/${venueSlug}`);
      redirect(`/sign-in?next=${next}`);
    }
    return resolved.error;
  }

  const parsed = startBookingSchema.safeParse({
    courtId: form.get("courtId"),
    startAt: form.get("startAt"),
    endAt: form.get("endAt"),
    venueSlug: form.get("venueSlug"),
    voucherCode: form.get("voucherCode") || undefined,
    contactEmail: form.get("contactEmail") || undefined,
    paymentMode: form.get("paymentMode") || undefined,
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  let bookingId: string;
  try {
    const booking = await createBooking({
      playerId: resolved.playerId,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      paymentMode: parsed.data.paymentMode,
      ...(parsed.data.voucherCode ? { voucherCode: parsed.data.voucherCode } : {}),
      ...(parsed.data.contactEmail ? { contactEmail: parsed.data.contactEmail } : {}),
    });
    bookingId = booking.id;
  } catch (err) {
    return unwrap(err);
  }

  if (resolved.isGuest) {
    after(() =>
      notifyGuestBookingMagicLink(bookingId, { isNewAccount: resolved.isNewGuest }),
    );
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
    paymentMode: "full" | "deposit";
    depositCentavos: string | null;
    balanceDueCentavos: string;
  }>
> {
  const venueSlug = (form.get("venueSlug") as string) ?? "";
  const resolved = await resolvePlayerForBooking(form, venueSlug);
  if (!resolved.ok) return resolved.error;

  const parsed = startBookingSchema.safeParse({
    courtId: form.get("courtId"),
    startAt: form.get("startAt"),
    endAt: form.get("endAt"),
    venueSlug: form.get("venueSlug"),
    voucherCode: form.get("voucherCode") || undefined,
    contactEmail: form.get("contactEmail") || undefined,
    paymentMode: form.get("paymentMode") || undefined,
  });
  if (!parsed.success) return fail("Invalid slot selection", "validation_failed");

  // For guests: contactEmail defaults to the guest's email so all booking
  // notifications reach the address they typed, even though the profile
  // email is the same.
  const effectiveContactEmail =
    parsed.data.contactEmail ??
    (resolved.isGuest ? (form.get("guestEmail") as string | null)?.trim().toLowerCase() : undefined);

  let bookingId: string;
  let booking;
  try {
    booking = await createBooking({
      playerId: resolved.playerId,
      courtId: parsed.data.courtId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      paymentMode: parsed.data.paymentMode,
      ...(parsed.data.voucherCode ? { voucherCode: parsed.data.voucherCode } : {}),
      ...(effectiveContactEmail ? { contactEmail: effectiveContactEmail } : {}),
    });
    bookingId = booking.id;
  } catch (err) {
    return unwrap(err);
  }

  if (resolved.isGuest) {
    after(() =>
      notifyGuestBookingMagicLink(bookingId, { isNewAccount: resolved.isNewGuest }),
    );
  }

  return {
    ok: true,
    data: {
      bookingId: booking.id,
      totalCentavos: booking.totalCentavos.toString(),
      courtFeeCentavos: booking.courtFeeCentavos.toString(),
      systemFeeCentavos: booking.systemFeeCentavos.toString(),
      discountCentavos: booking.discountCentavos.toString(),
      voucherCodeSnapshot: booking.voucherCodeSnapshot,
      paymentMode: booking.paymentMode === "deposit" ? "deposit" : "full",
      depositCentavos: booking.depositCentavos === null ? null : booking.depositCentavos.toString(),
      balanceDueCentavos: booking.balanceDueCentavos.toString(),
    },
  };
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
