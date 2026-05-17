"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { getCurrentUser } from "@/features/auth/service";
import { requireAdmin } from "@/features/admin/service";
import { recordAudit } from "@/features/admin/audit";
import { isAdminError } from "@/features/admin/errors";
import { captureException } from "@/lib/observability";
import { getCurrentBookingFeeRule } from "@/features/system-settings";
import { findCurrentBookingCourtFeeForUser } from "./preview-helpers";
import {
  createVoucherInputSchema,
  phpToCentavos,
  updateVoucherStatusSchema,
} from "./schema";
import { validateVoucherForBooking } from "./service";
import * as repo from "./repo";
import { isVoucherError } from "./errors";

function fail<T = never>(message: string, code = "unknown"): ActionResult<T> {
  return { ok: false, code, message };
}

function unwrapAdmin<T = never>(err: unknown): ActionResult<T> {
  if (isAdminError(err)) return { ok: false, code: err.code, message: err.message };
  captureException(err, { scope: "vouchers.action" });
  return fail<T>("Something went wrong. Please try again.");
}

function fieldErrorsFromZod(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Admin: create voucher
// ---------------------------------------------------------------------------
export async function createVoucherAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrapAdmin(err);
  }

  const parsed = createVoucherInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const d = parsed.data;

  // Reject duplicate codes (case-insensitive).
  const existing = await repo.findVoucherByCode(d.code);
  if (existing) {
    return {
      ok: false,
      code: "duplicate_code",
      message: "A voucher with this code already exists.",
      fieldErrors: { code: ["Already taken — choose another code"] },
    };
  }

  let discountValueRaw: bigint;
  let minFeeCentavos: bigint;
  try {
    discountValueRaw =
      d.discountType === "percent" ? BigInt(d.discountValue) : phpToCentavos(d.discountValue);
    minFeeCentavos = phpToCentavos(d.minCourtFeePhp);
  } catch {
    return {
      ok: false,
      code: "validation",
      message: "Invalid amount.",
      fieldErrors: { discountValue: ["Use a number with up to 2 decimals"] },
    };
  }

  const validUntil = d.validUntilDate
    ? new Date(`${d.validUntilDate}T23:59:59+08:00`) // end of day Manila
    : null;

  try {
    const voucher = await repo.insertVoucher({
      code: d.code.toUpperCase(),
      discountType: d.discountType,
      discountValue: discountValueRaw,
      maxRedemptions: d.maxRedemptions === null ? null : Number(d.maxRedemptions),
      maxPerUser: Number(d.maxPerUser),
      minCourtFeeCentavos: minFeeCentavos,
      validUntil,
      notes: d.notes,
      createdBy: admin.id,
    });
    await recordAudit({
      actor: admin,
      action: "voucher.create",
      targetType: "voucher",
      targetId: voucher.id,
      after: {
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue.toString(),
        maxRedemptions: voucher.maxRedemptions,
        maxPerUser: voucher.maxPerUser,
      },
    });
    revalidatePath("/admin/vouchers");
    return { ok: true, data: { id: voucher.id } };
  } catch (err) {
    captureException(err, { scope: "vouchers.create" });
    return fail("Failed to create voucher. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Admin: change status (active / paused / expired)
// ---------------------------------------------------------------------------
export async function updateVoucherStatusAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrapAdmin(err);
  }
  const parsed = updateVoucherStatusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Invalid request", "validation");

  const updated = await repo.updateVoucherStatus(parsed.data.voucherId, parsed.data.status);
  if (!updated) return fail("Voucher not found", "not_found");

  await recordAudit({
    actor: admin,
    action: "voucher.status_change",
    targetType: "voucher",
    targetId: updated.id,
    after: { status: updated.status, code: updated.code },
  });
  revalidatePath("/admin/vouchers");
  revalidatePath(`/admin/vouchers/${updated.id}`);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Player: preview a voucher against the current base fee + a specific court
// ---------------------------------------------------------------------------
const previewSchema = z.object({
  code: z.string().trim().min(1).max(40),
  courtId: z.string().uuid(),
  durationMinutes: z.coerce.number().int().min(30).max(240),
  startManilaHour: z.coerce.number().int().min(0).max(23),
});

export async function previewVoucherAction(
  _prev: unknown,
  form: FormData,
): Promise<
  ActionResult<{
    code: string;
    discountCentavos: string;
    baseSystemFeeCentavos: string;
    discountedSystemFeeCentavos: string;
    label: string;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in to apply a voucher", "not_authorized");

  const parsed = previewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Invalid voucher request", "validation");

  try {
    const courtFeeCentavos = await findCurrentBookingCourtFeeForUser({
      courtId: parsed.data.courtId,
      durationMinutes: parsed.data.durationMinutes,
      startManilaHour: parsed.data.startManilaHour,
    });
    const feeRule = await getCurrentBookingFeeRule();
    const validated = await validateVoucherForBooking({
      code: parsed.data.code,
      userId: user.id,
      courtFeeCentavos,
      baseSystemFeeCentavos: feeRule.snapshotCentavos,
    });
    const label =
      validated.voucher.discountType === "percent"
        ? `${validated.voucher.discountValue.toString()}% off booking fee`
        : `₱${(Number(validated.voucher.discountValue) / 100).toFixed(2)} off booking fee`;
    return {
      ok: true,
      data: {
        code: validated.voucher.code,
        discountCentavos: validated.discountCentavos.toString(),
        baseSystemFeeCentavos: feeRule.snapshotCentavos.toString(),
        discountedSystemFeeCentavos: validated.discountedSystemFeeCentavos.toString(),
        label,
      },
    };
  } catch (err) {
    if (isVoucherError(err)) {
      return { ok: false, code: err.code, message: err.message };
    }
    captureException(err, { scope: "vouchers.preview" });
    return fail("Could not validate voucher. Please try again.");
  }
}
