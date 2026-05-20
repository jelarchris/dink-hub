"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { getSessionUser } from "@/server/session";
import { isOwnerVenueError } from "@/features/owner-venues/errors";
import {
  createCourt,
  createVenue,
  saveCourtRateBands,
  setCourtActive,
  setVenueStatus,
  updateCourt,
  updateVenue,
} from "@/features/owner-venues/service";
import {
  courtUpsertSchema,
  venueStatusActionSchema,
  venueUpsertSchema,
} from "@/features/owner-venues/schema";
import { deleteVenueMedia, uploadVenueMedia } from "@/features/storage/venue-media";

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isOwnerVenueError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  console.error("[owner-venue-action]", err);
  return fail("Something went wrong. Please try again.");
}

function fieldErrorsFromZod(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

async function ensureOwner(): Promise<
  | { ok: true; userId: string }
  | { ok: false; result: ActionResult<never> }
> {
  const profile = await getSessionUser();
  if (!profile) return { ok: false, result: fail("You must be signed in.", "unauthenticated") };
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return {
      ok: false,
      result: fail("Only venue owners can manage venues.", "not_owner"),
    };
  }
  return { ok: true, userId: profile.id };
}

/**
 * Resolve the storage path for an image field carried in a FormData submission:
 *
 *   - If a non-empty File was picked → upload, return its new path (and best-
 *     effort delete the previous one).
 *   - Else if the user clicked Remove → return null (and delete the previous).
 *   - Else → keep the existing path unchanged.
 *
 * Mutates the form by deleting the file/flag fields so downstream
 * `Object.fromEntries(form)` parsing sees a clean record.
 */
async function resolveImagePath(args: {
  form: FormData;
  fileField: string;
  existingField: string;
  removeField: string;
  kind: "venue-cover" | "court" | "gcash-qr";
}): Promise<{ ok: true; path: string | null } | { ok: false; result: ActionResult<never> }> {
  const { form, fileField, existingField, removeField, kind } = args;
  const fileEntry = form.get(fileField);
  const existing = (form.get(existingField) ?? "").toString() || null;
  const removed = (form.get(removeField) ?? "").toString() === "1";

  // Strip from FormData so the schema parse never sees these.
  form.delete(fileField);
  form.delete(existingField);
  form.delete(removeField);

  if (fileEntry instanceof File && fileEntry.size > 0) {
    const result = await uploadVenueMedia({ kind, file: fileEntry });
    if (!result.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "validation",
          message: result.error.message,
          fieldErrors: { [fileField]: [result.error.message] },
        },
      };
    }
    if (existing) await deleteVenueMedia(existing);
    return { ok: true, path: result.data.path };
  }

  if (removed) {
    if (existing) await deleteVenueMedia(existing);
    return { ok: true, path: null };
  }

  return { ok: true, path: existing };
}

// ----------------------------------------------------------------------------
// venue actions
// ----------------------------------------------------------------------------

export async function createVenueAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const img = await resolveImagePath({
    form,
    fileField: "coverImageFile",
    existingField: "coverImagePath",
    removeField: "coverImageFile__remove",
    kind: "venue-cover",
  });
  if (!img.ok) return img.result;
  if (img.path) form.set("coverImagePath", img.path);

  const qr = await resolveImagePath({
    form,
    fileField: "gcashQrImageFile",
    existingField: "gcashQrImagePath",
    removeField: "gcashQrImageFile__remove",
    kind: "gcash-qr",
  });
  if (!qr.ok) return qr.result;
  if (qr.path) form.set("gcashQrImagePath", qr.path);

  const parsed = venueUpsertSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  let newId: string;
  try {
    const v = await createVenue({ ownerId: guard.userId, input: parsed.data });
    newId = v.id;
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/owner/venues");
  redirect(`/owner/venues/${newId}`);
}

const updateVenueFormSchema = venueUpsertSchema.extend({
  venueId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1),
});

export async function updateVenueAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const img = await resolveImagePath({
    form,
    fileField: "coverImageFile",
    existingField: "coverImagePath",
    removeField: "coverImageFile__remove",
    kind: "venue-cover",
  });
  if (!img.ok) return img.result;
  // Always set the resolved path (may be null) so the schema sees the final value.
  form.set("coverImagePath", img.path ?? "");

  const qr = await resolveImagePath({
    form,
    fileField: "gcashQrImageFile",
    existingField: "gcashQrImagePath",
    removeField: "gcashQrImageFile__remove",
    kind: "gcash-qr",
  });
  if (!qr.ok) return qr.result;
  form.set("gcashQrImagePath", qr.path ?? "");

  const parsed = updateVenueFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { venueId, expectedVersion, ...input } = parsed.data;
  try {
    await updateVenue({
      ownerId: guard.userId,
      venueId,
      expectedVersion,
      input,
    });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath(`/owner/venues/${venueId}`);
  revalidatePath("/owner/venues");
  return { ok: true, data: undefined as never };
}

const venueStatusFormSchema = z.object({
  venueId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  action: venueStatusActionSchema,
});

export async function setVenueStatusAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;
  const parsed = venueStatusFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Invalid request.", "validation");
  try {
    await setVenueStatus({
      ownerId: guard.userId,
      venueId: parsed.data.venueId,
      expectedVersion: parsed.data.expectedVersion,
      action: parsed.data.action,
    });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath(`/owner/venues/${parsed.data.venueId}`);
  revalidatePath("/owner/venues");
  return { ok: true, data: undefined as never };
}

// ----------------------------------------------------------------------------
// court actions
// ----------------------------------------------------------------------------

const createCourtFormSchema = courtUpsertSchema.extend({
  venueId: z.string().uuid(),
});

export async function createCourtAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const img = await resolveImagePath({
    form,
    fileField: "imageFile",
    existingField: "imagePath",
    removeField: "imageFile__remove",
    kind: "court",
  });
  if (!img.ok) return img.result;
  if (img.path) form.set("imagePath", img.path);

  const parsed = createCourtFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { venueId, ...input } = parsed.data;
  try {
    await createCourt({ ownerId: guard.userId, venueId, input });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath(`/owner/venues/${venueId}`);
  redirect(`/owner/venues/${venueId}`);
}

const updateCourtFormSchema = courtUpsertSchema.extend({
  courtId: z.string().uuid(),
  venueId: z.string().uuid(),
});

export async function updateCourtAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const img = await resolveImagePath({
    form,
    fileField: "imageFile",
    existingField: "imagePath",
    removeField: "imageFile__remove",
    kind: "court",
  });
  if (!img.ok) return img.result;
  form.set("imagePath", img.path ?? "");

  const parsed = updateCourtFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { courtId, venueId, ...input } = parsed.data;
  try {
    await updateCourt({ ownerId: guard.userId, courtId, input });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath(`/owner/venues/${venueId}`);
  return { ok: true, data: undefined as never };
}

const setCourtActiveFormSchema = z.object({
  courtId: z.string().uuid(),
  venueId: z.string().uuid(),
  isActive: z.union([z.literal("true"), z.literal("false")]).transform((v) => v === "true"),
});

export async function setCourtActiveAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;
  const parsed = setCourtActiveFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Invalid request.", "validation");
  try {
    await setCourtActive({
      ownerId: guard.userId,
      courtId: parsed.data.courtId,
      isActive: parsed.data.isActive,
    });
  } catch (err) {
    return unwrap(err);
  }
  revalidatePath(`/owner/venues/${parsed.data.venueId}`);
  return { ok: true, data: undefined as never };
}

// ----------------------------------------------------------------------------
// booking actions — no-show
// ----------------------------------------------------------------------------

const markNoShowFormSchema = z.object({
  bookingId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1),
});

/**
 * Mark a confirmed booking as no-show.
 *
 * Only the venue owner (or admin) may call this. Authorization is enforced
 * server-side by verifying `venues.owner_id = session.user.id` in the UPDATE.
 * The booking must be `confirmed` — any other status is rejected.
 */
export async function markNoShowAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = markNoShowFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Invalid request.", "validation");

  const { bookingId, expectedVersion } = parsed.data;

  // Authorization + status check + optimistic concurrency in one atomic UPDATE.
  // The WHERE clause joins through venues to verify ownership — the DB rejects
  // any attempt to mark a booking at someone else's venue.
  const { db } = await import("@/db/client");
  const { bookings } = await import("@/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  const updated = await db
    .update(bookings)
    .set({
      status: "no_show",
      cancelledAt: new Date(),
      cancelledBy: guard.userId,
      version: sql`${bookings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.status, "confirmed"),
        eq(bookings.version, expectedVersion),
        // Ownership check via subquery — deny if venue doesn't belong to this owner.
        sql`${bookings.venueId} in (
          select id from venues
          where owner_id = ${guard.userId}
          and deleted_at is null
        )`,
      ),
    )
    .returning({ id: bookings.id, venueId: bookings.venueId });

  if (updated.length === 0) {
    // Could be: wrong version, wrong status, or not their venue.
    return {
      ok: false,
      code: "conflict",
      message:
        "Could not mark as no-show. The booking may have already been updated — please refresh.",
    };
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/bookings/${bookingId}`);
  return { ok: true, data: undefined as never };
}

// ============================================================================
// Owner cancel booking (Tier 4)
// ============================================================================

const cancelBookingFormSchema = z.object({
  bookingId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  category: z.enum([
    "weather",
    "court_unavailable",
    "venue_closure",
    "player_request",
    "admin_action",
    "other",
  ]),
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
});

export async function cancelBookingByOwnerAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = cancelBookingFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { bookingId, expectedVersion, category, reason } = parsed.data;

  const { cancelBookingByOwner } = await import("@/features/booking/service");
  const { isBookingError } = await import("@/features/booking/errors");
  const { notifyBookingCancelledByOwner } = await import("@/features/booking/notifications");

  try {
    await cancelBookingByOwner({
      bookingId,
      ownerId: guard.userId,
      expectedVersion,
      category,
      reason,
    });
  } catch (err) {
    if (isBookingError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[owner-cancel-booking]", err);
    return fail("Could not cancel the booking. Please try again.");
  }

  // Best-effort notification — never blocks the action.
  await notifyBookingCancelledByOwner(bookingId, reason);

  revalidatePath("/owner");
  revalidatePath(`/owner/bookings/${bookingId}`);
  return { ok: true, data: undefined as never };
}

// ============================================================================
// Owner reschedule booking (Tier 4)
// ============================================================================

const rescheduleBookingFormSchema = z.object({
  bookingId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().min(1),
  // ISO 8601 with offset (the form serialises Manila wall-clock with +08:00)
  newStartAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  newEndAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  // Optional: different court within the same venue.
  // Empty string (no court change) → treated as undefined.
  newCourtId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reason: z.string().max(500).optional(),
});

export async function rescheduleBookingByOwnerAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = rescheduleBookingFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { bookingId, expectedVersion, newStartAt, newEndAt, newCourtId, reason } = parsed.data;

  // Capture original times for the notification BEFORE the mutation.
  const { db } = await import("@/db/client");
  const { bookings } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const before = await db
    .select({ startAt: bookings.startAt, endAt: bookings.endAt })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  const oldStartAt = before[0]?.startAt;
  const oldEndAt = before[0]?.endAt;

  const { rescheduleBookingByOwner } = await import("@/features/booking/service");
  const { isBookingError } = await import("@/features/booking/errors");
  const { notifyBookingRescheduledByOwner } = await import("@/features/booking/notifications");

  try {
    await rescheduleBookingByOwner({
      bookingId,
      ownerId: guard.userId,
      expectedVersion,
      newStartAt,
      newEndAt,
      ...(newCourtId ? { newCourtId } : {}),
      ...(reason ? { reason } : {}),
    });
  } catch (err) {
    if (isBookingError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[owner-reschedule-booking]", err);
    return fail("Could not reschedule the booking. Please try again.");
  }

  if (oldStartAt && oldEndAt) {
    await notifyBookingRescheduledByOwner(bookingId, oldStartAt, oldEndAt, reason ?? null);
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/bookings/${bookingId}`);
  return { ok: true, data: undefined as never };
}

// ============================================================================
// Court slot occupancy for the reschedule slot picker
//
// Returns all occupied ranges (bookings, holds, closures) for a given court
// on a given Manila calendar day so the RescheduleForm can render a live
// availability grid.
//
// Security: verifies the caller owns the venue the court belongs to before
// returning any data. Returns [] on any auth or validation failure.
// ============================================================================
export async function getCourtOccupancyForRescheduleAction(
  courtId: string,
  isoDate: string, // YYYY-MM-DD, Manila calendar
): Promise<Array<{ startAtIso: string; endAtIso: string; kind: "booking" | "hold" | "closure" }>> {
  const guard = await ensureOwner();
  if (!guard.ok) return [];

  // Validate inputs defensively (client-supplied).
  if (!courtId || !/^[0-9a-f-]{36}$/.test(courtId)) return [];
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!dateMatch) return [];
  const [, yStr, moStr, dStr] = dateMatch;
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);

  // Verify ownership: owner must own the venue this court belongs to.
  const { db } = await import("@/db/client");
  const { courts, venues } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const owned = await db
    .select({ id: courts.id })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(and(eq(courts.id, courtId), eq(venues.ownerId, guard.userId)))
    .limit(1);
  if (!owned[0]) return [];

  // Compute Manila-day window as UTC.
  // Manila is fixed UTC+8; Manila 00:00 = UTC of previous day + 16h.
  const MANILA_OFFSET_MS = 8 * 3_600_000;
  const fromUtc = new Date(Date.UTC(y, mo - 1, d, 0, 0) - MANILA_OFFSET_MS);
  const toUtc = new Date(fromUtc.getTime() + 24 * 3_600_000);

  const { getCourtOccupancy } = await import("@/features/venues/repo");
  const { ranges } = await getCourtOccupancy({ courtId, fromUtc, toUtc });

  return ranges.map((r) => ({
    startAtIso: r.startAt.toISOString(),
    endAtIso: r.endAt.toISOString(),
    kind: r.kind,
  }));
}

// ============================================================================
// Owner record refund (Tier 5)
// ============================================================================

const recordOwnerRefundFormSchema = z.object({
  bookingId: z.string().uuid(),
  paymentId: z.string().uuid(),
  paymentExpectedVersion: z.coerce.number().int().min(1),
  notes: z.string().max(500).optional(),
});

export async function recordOwnerRefundAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = recordOwnerRefundFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { bookingId, paymentId, paymentExpectedVersion, notes } = parsed.data;

  const { recordOwnerRefund } = await import("@/features/booking/service");
  const { isBookingError } = await import("@/features/booking/errors");

  try {
    await recordOwnerRefund({
      bookingId,
      paymentId,
      paymentExpectedVersion,
      ownerId: guard.userId,
      ...(notes ? { notes } : {}),
    });
  } catch (err) {
    if (isBookingError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[owner-record-refund]", err);
    return fail("Could not record the refund. Please try again.");
  }

  revalidatePath("/owner");
  revalidatePath(`/owner/bookings/${bookingId}`);
  return { ok: true, data: undefined as never };
}

// ============================================================================
// Tier 6 — bulk venue/court closure
// ============================================================================

// Parses Manila wall-clock datetime strings (with +08:00 offset) from FormData.
const isoOffsetToDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const closureFormBaseSchema = z.object({
  venueId: z.string().uuid(),
  // Comma-separated court IDs supplied by the multi-select.
  courtIds: z.string().transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  fromAt: isoOffsetToDate,
  untilAt: isoOffsetToDate,
  category: z.enum([
    "weather",
    "court_unavailable",
    "venue_closure",
    "player_request",
    "admin_action",
    "other",
  ]),
  reason: z.string().min(3, "Reason must be at least 3 characters").max(500),
  // HTML checkboxes submit "on" when checked, nothing when unchecked.
  autoReschedule: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export interface ClosurePreviewData {
  bookingCount: number;
  totalCentavos: string; // bigint serialised as string for client
  autoRescheduleableCount: number;
}

export async function previewClosureRangeAction(
  _prev: ActionResult<ClosurePreviewData> | null,
  form: FormData,
): Promise<ActionResult<ClosurePreviewData>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = closureFormBaseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { venueId, courtIds, fromAt, untilAt, category, reason, autoReschedule } = parsed.data;

  const { previewClosureRange } = await import("@/features/booking/service");
  const { isBookingError } = await import("@/features/booking/errors");

  try {
    const preview = await previewClosureRange({
      venueId,
      ownerId: guard.userId,
      courtIds,
      fromAt,
      untilAt,
      category,
      reason,
      autoReschedule,
    });
    return {
      ok: true,
      data: {
        bookingCount: preview.bookingCount,
        totalCentavos: preview.totalCentavos.toString(),
        autoRescheduleableCount: preview.autoRescheduleableCount,
      },
    };
  } catch (err) {
    if (isBookingError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[closure-preview]", err);
    return fail("Could not preview closure. Please try again.");
  }
}

export interface CloseBookingsData {
  cancelledCount: number;
  skippedCount: number;
  autoRescheduledCount: number;
}

export async function closeBookingsForRangeAction(
  _prev: ActionResult<CloseBookingsData> | null,
  form: FormData,
): Promise<ActionResult<CloseBookingsData>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = closureFormBaseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { venueId, courtIds, fromAt, untilAt, category, reason, autoReschedule } = parsed.data;

  const { closeBookingsForRange } = await import("@/features/booking/service");
  const { isBookingError } = await import("@/features/booking/errors");
  const { notifyBookingCancelledByOwner, notifyBookingAutoMoved } = await import(
    "@/features/booking/notifications"
  );

  let cancelledBookingIds: string[] = [];
  let autoRescheduledMoves: Awaited<
    ReturnType<typeof closeBookingsForRange>
  >["autoRescheduledMoves"] = [];
  let cancelledCount = 0;
  let skippedCount = 0;
  let autoRescheduledCount = 0;

  try {
    const outcome = await closeBookingsForRange({
      venueId,
      ownerId: guard.userId,
      courtIds,
      fromAt,
      untilAt,
      category,
      reason,
      autoReschedule,
    });
    cancelledBookingIds = outcome.cancelledBookingIds;
    autoRescheduledMoves = outcome.autoRescheduledMoves;
    cancelledCount = outcome.result.cancelledCount;
    skippedCount = outcome.result.skippedCount;
    autoRescheduledCount = outcome.result.autoRescheduledCount;
  } catch (err) {
    if (isBookingError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[closure-commit]", err);
    return fail("Could not close the venue. Please try again.");
  }

  // Best-effort — fire after tx commits, never block the response.
  await Promise.allSettled([
    ...cancelledBookingIds.map((id) => notifyBookingCancelledByOwner(id, reason)),
    ...autoRescheduledMoves.map((m) =>
      notifyBookingAutoMoved(m.newBookingId, m.oldCourtName, m.oldStartAt, m.oldEndAt, reason),
    ),
  ]);

  revalidatePath("/owner");
  revalidatePath(`/owner/venues/${venueId}`);

  return { ok: true, data: { cancelledCount, skippedCount, autoRescheduledCount } };
}

// ============================================================================
// Tier 9 — per-court closures (maintenance / private events)
// ============================================================================

const addCourtClosureFormSchema = z.object({
  courtId: z.string().uuid(),
  startAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  endAt: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s)),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export async function addCourtClosureAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = addCourtClosureFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { courtId, startAt, endAt, reason } = parsed.data;

  const { addCourtClosure } = await import("@/features/owner-venues/service");

  try {
    await addCourtClosure({
      ownerId: guard.userId,
      courtId,
      input: { startAt, endAt, ...(reason ? { reason } : {}) },
    });
  } catch (err) {
    if (isOwnerVenueError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[add-court-closure]", err);
    return fail("Could not add closure. Please try again.");
  }

  revalidatePath("/owner");
  // Revalidate court detail page — caller passes courtId, venueId is unknown
  // here so we do a broad revalidate.
  revalidatePath("/owner/venues", "layout");
  return { ok: true, data: undefined as never };
}

const removeCourtClosureFormSchema = z.object({
  closureId: z.string().uuid(),
  courtId: z.string().uuid(),
});

export async function removeCourtClosureAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const parsed = removeCourtClosureFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Invalid request.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { closureId } = parsed.data;

  const { removeCourtClosure } = await import("@/features/owner-venues/service");

  try {
    await removeCourtClosure({ ownerId: guard.userId, closureId });
  } catch (err) {
    if (isOwnerVenueError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[remove-court-closure]", err);
    return fail("Could not remove closure. Please try again.");
  }

  revalidatePath("/owner");
  revalidatePath("/owner/venues", "layout");
  return { ok: true, data: undefined as never };
}

// ============================================================================
// Court hourly rate bands
// ============================================================================

/**
 * Atomically replaces all rate bands for a court.
 * Accepts a JSON array of bands serialised as a single FormData field.
 * Shape: [{fromHour, toHour, rateCentavos (string)}[]]
 */
export async function saveCourtRateBandsAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

  const rawBandsSchema = z.object({
    courtId: z.string().uuid(),
    venueId: z.string().uuid(),
    bandsJson: z
      .string()
      .transform((s) => JSON.parse(s) as unknown)
      .pipe(
        z
          .array(
            z.object({
              fromHour: z.coerce.number().int().min(0).max(23),
              toHour: z.coerce.number().int().min(1).max(24),
              rateCentavos: z
                .string()
                .regex(/^\d+$/)
                .transform((s) => BigInt(s)),
            }),
          )
          .max(12),
      ),
  });

  const parsed = rawBandsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Invalid rate bands.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const { courtId, venueId, bandsJson: bands } = parsed.data;

  try {
    await saveCourtRateBands({ ownerId: guard.userId, courtId, bands });
  } catch (err) {
    if (isOwnerVenueError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    console.error("[save-court-rate-bands]", err);
    return fail("Could not save rate bands. Please try again.");
  }

  revalidatePath(`/owner/venues/${venueId}/courts/${courtId}`);
  return { ok: true, data: undefined as never };
}
