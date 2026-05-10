"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { isAdminError } from "./errors";
import {
  forceCancelBooking,
  requireAdmin,
  reviewVenue,
  setUserSuspension,
  updateSystemFee,
  updateUserRole,
} from "./service";
import {
  forceCancelBookingInputSchema,
  setUserSuspensionInputSchema,
  updateSystemFeeInputSchema,
  updateUserRoleInputSchema,
  venueReviewInputSchema,
} from "./schema";

function fail(message: string, code = "unknown"): ActionResult {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult {
  if (isAdminError(err)) return { ok: false, code: err.code, message: err.message };
  console.error("[admin-action]", err);
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

// ----------------------------------------------------------------------------
// venue review
// ----------------------------------------------------------------------------

export async function reviewVenueAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = venueReviewInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await reviewVenue(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/venues");
  revalidatePath(`/admin/venues/${parsed.data.venueId}`);
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// users
// ----------------------------------------------------------------------------

export async function updateUserRoleAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = updateUserRoleInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await updateUserRole(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true, data: undefined };
}

export async function setUserSuspensionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = setUserSuspensionInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await setUserSuspension(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// system fee
// ----------------------------------------------------------------------------

export async function updateSystemFeeAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = updateSystemFeeInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await updateSystemFee(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/system-fee");
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// bookings
// ----------------------------------------------------------------------------

export async function forceCancelBookingAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = forceCancelBookingInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await forceCancelBooking(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  return { ok: true, data: undefined };
}
