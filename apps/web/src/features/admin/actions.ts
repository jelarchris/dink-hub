"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { captureException } from "@/lib/observability";
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
  generatePayout,
  markPayoutPaid,
  togglePayoutHold,
} from "./payouts";
import { openDispute, resolveDispute } from "./disputes";
import { rejectOwnerInvoice, verifyOwnerInvoice } from "./owner-invoices";
import {
  notifyBookingForceCancelled,
  notifyDisputeOpened,
  notifyDisputeResolved,
} from "@/features/booking/notifications";
import {
  notifyOwnerInvoiceRejected,
  notifyOwnerInvoiceVerified,
} from "@/features/owner-invoices/notifications";
import {
  forceCancelBookingInputSchema,
  generatePayoutInputSchema,
  markPayoutPaidInputSchema,
  openDisputeInputSchema,
  rejectOwnerInvoiceInputSchema,
  resolveDisputeInputSchema,
  setUserSuspensionInputSchema,
  togglePayoutHoldInputSchema,
  updateSystemFeeInputSchema,
  updateUserRoleInputSchema,
  venueReviewInputSchema,
  verifyOwnerInvoiceInputSchema,
} from "./schema";

function fail(message: string, code = "unknown"): ActionResult {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult {
  if (isAdminError(err)) return { ok: false, code: err.code, message: err.message };
  captureException(err, { scope: "admin.action" });
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

  await notifyBookingForceCancelled(parsed.data.bookingId, parsed.data.reason);

  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// payouts
// ----------------------------------------------------------------------------

export async function generatePayoutAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = generatePayoutInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  let payoutId: string;
  try {
    const payout = await generatePayout(admin, parsed.data);
    payoutId = payout.id;
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${payoutId}`);
  return { ok: true, data: { payoutId } };
}

export async function markPayoutPaidAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = markPayoutPaidInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await markPayoutPaid(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${parsed.data.payoutId}`);
  revalidatePath("/admin/ledger");
  return { ok: true, data: undefined };
}

export async function togglePayoutHoldAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = togglePayoutHoldInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await togglePayoutHold(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${parsed.data.payoutId}`);
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// disputes
// ----------------------------------------------------------------------------

export async function openDisputeAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = openDisputeInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await openDispute(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  await notifyDisputeOpened(parsed.data.paymentId, parsed.data.reason);

  revalidatePath("/admin/bookings");
  return { ok: true, data: undefined };
}

export async function resolveDisputeAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = resolveDisputeInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await resolveDispute(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  await notifyDisputeResolved(parsed.data.paymentId, parsed.data.resolution, parsed.data.notes ?? null);

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/ledger");
  return { ok: true, data: undefined };
}

// ----------------------------------------------------------------------------
// owner invoices (verification queue)
// ----------------------------------------------------------------------------

export async function verifyOwnerInvoiceAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = verifyOwnerInvoiceInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await verifyOwnerInvoice(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  // Fire-and-forget; never blocks the action result.
  await notifyOwnerInvoiceVerified(parsed.data.invoiceId);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/admin/ledger");
  revalidatePath("/owner/invoices");
  revalidatePath(`/owner/invoices/${parsed.data.invoiceId}`);
  return { ok: true, data: undefined };
}

export async function rejectOwnerInvoiceAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const parsed = rejectOwnerInvoiceInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await rejectOwnerInvoice(admin, parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  await notifyOwnerInvoiceRejected(parsed.data.invoiceId, parsed.data.reason);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/owner/invoices");
  revalidatePath(`/owner/invoices/${parsed.data.invoiceId}`);
  return { ok: true, data: undefined };
}
