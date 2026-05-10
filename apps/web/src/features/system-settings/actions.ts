"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { requireAdmin } from "@/features/admin/service";
import { recordAudit } from "@/features/admin/audit";
import { isAdminError } from "@/features/admin/errors";
import { captureException } from "@/lib/observability";
import { deleteVenueMedia, uploadVenueMedia } from "@/features/storage/venue-media";
import { phpStringToCentavos, updateSystemSettingsSchema } from "./schema";
import { getSystemSettings, updateSystemSettings } from "./service";

function fail(message: string, code = "unknown"): ActionResult {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult {
  if (isAdminError(err)) return { ok: false, code: err.code, message: err.message };
  captureException(err, { scope: "system-settings.action" });
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

/**
 * Resolve the DinkHub GCash QR image: upload a new file, clear the existing
 * one, or keep it untouched. Mirrors the venue-form pattern in
 * `owner-venues/actions.ts`.
 */
async function resolveQrPath(
  form: FormData,
  existingPath: string | null,
): Promise<{ ok: true; path: string | null } | { ok: false; result: ActionResult }> {
  const fileEntry = form.get("dinkhubGcashQrImageFile");
  const removed = (form.get("dinkhubGcashQrImageFile__remove") ?? "").toString() === "1";
  form.delete("dinkhubGcashQrImageFile");
  form.delete("dinkhubGcashQrImageFile__remove");
  form.delete("dinkhubGcashQrImagePath");

  if (fileEntry instanceof File && fileEntry.size > 0) {
    const result = await uploadVenueMedia({ kind: "system-qr", file: fileEntry });
    if (!result.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "validation",
          message: result.error.message,
          fieldErrors: { dinkhubGcashQrImageFile: [result.error.message] },
        },
      };
    }
    if (existingPath) await deleteVenueMedia(existingPath);
    return { ok: true, path: result.data.path };
  }
  if (removed) {
    if (existingPath) await deleteVenueMedia(existingPath);
    return { ok: true, path: null };
  }
  return { ok: true, path: existingPath };
}

export async function updateSystemSettingsAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    return unwrap(err);
  }

  const before = await getSystemSettings();
  const qr = await resolveQrPath(form, before.dinkhubGcashQrImagePath);
  if (!qr.ok) return qr.result;

  const parsed = updateSystemSettingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Please fix the errors below.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  let after;
  try {
    after = await updateSystemSettings({
      actorId: admin.id,
      patch: {
        promoActive: data.promoActive,
        promoShowOnHome: data.promoShowOnHome,
        promoShowOnBooking: data.promoShowOnBooking,
        promoHeadline: data.promoHeadline,
        promoDescription: data.promoDescription,
        promoUntilDate: data.promoUntilDate,
        baseBookingFeeCentavos: phpStringToCentavos(data.baseBookingFeePhp),
        invoiceDueDays: data.invoiceDueDays,
        dinkhubGcashAccountName: data.dinkhubGcashAccountName,
        dinkhubGcashAccountNumber: data.dinkhubGcashAccountNumber,
        dinkhubGcashQrImagePath: qr.path,
      },
    });
  } catch (err) {
    return unwrap(err);
  }

  try {
    await recordAudit({
      actor: admin,
      action: "system_settings.update",
      targetType: "system_settings",
      targetId: null,
      before: serialiseForAudit(before),
      after: serialiseForAudit(after),
      reason: data.notes,
    });
  } catch (err) {
    captureException(err, { scope: "system-settings.audit" });
  }

  // Promo state powers the global banner; re-render every page that reads it.
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

function serialiseForAudit(s: {
  promoActive: boolean;
  promoHeadline: string;
  promoDescription: string;
  promoUntilDate: string | null;
  promoShowOnHome: boolean;
  promoShowOnBooking: boolean;
  baseBookingFeeCentavos: bigint;
  invoiceDueDays: number;
  dinkhubGcashAccountName: string | null;
  dinkhubGcashAccountNumber: string | null;
  dinkhubGcashQrImagePath: string | null;
}): Record<string, unknown> {
  return {
    promoActive: s.promoActive,
    promoHeadline: s.promoHeadline,
    promoDescription: s.promoDescription,
    promoUntilDate: s.promoUntilDate,
    promoShowOnHome: s.promoShowOnHome,
    promoShowOnBooking: s.promoShowOnBooking,
    baseBookingFeeCentavos: s.baseBookingFeeCentavos.toString(),
    invoiceDueDays: s.invoiceDueDays,
    dinkhubGcashAccountName: s.dinkhubGcashAccountName,
    dinkhubGcashAccountNumber: s.dinkhubGcashAccountNumber,
    dinkhubGcashQrImagePath: s.dinkhubGcashQrImagePath,
  };
}
