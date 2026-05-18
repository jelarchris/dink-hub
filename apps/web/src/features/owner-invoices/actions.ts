"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { getSessionUser } from "@/server/session";
import { uploadInvoiceReceipt } from "@/features/storage";
import {
  findInvoiceForOwner,
  isOwnerInvoiceError,
  submitInvoicePayment,
} from "./service";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import { captureException } from "@/lib/observability";

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isOwnerInvoiceError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  captureException(err, { scope: "owner-invoices.action" });
  return fail("Something went wrong. Please try again.");
}

/** Light schema — heavy validation lives in the service. */
const formSchema = z.object({
  invoiceId: z.string().uuid(),
  gcashReferenceNumber: z
    .string()
    .trim()
    .min(6, "GCash reference must be at least 6 characters")
    .max(40, "GCash reference must be 40 characters or less")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function submitInvoiceReceiptAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const profile = await getSessionUser();
  if (!profile) return fail("Please sign in", "not_authorized");
  if (profile.role !== "venue_owner" && profile.role !== "admin") {
    return fail("Only venue owners can pay invoices.", "not_owner");
  }

  // Rate limit per user before any heavy work (file read, hash, storage put).
  const rl = await checkRateLimit(limiters.receiptUpload, `invoice-receipt:${profile.id}`);
  if (!rl.allowed) return fail(rateLimitMessage(rl.resetMs), "rate_limited");

  const ref = form.get("gcashReferenceNumber");
  const parsed = formSchema.safeParse({
    invoiceId: form.get("invoiceId"),
    gcashReferenceNumber: typeof ref === "string" ? ref : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Re-load and authorize: only this owner can pay this invoice.
  const detail = await findInvoiceForOwner(parsed.data.invoiceId, profile.id);
  if (!detail) return fail("Invoice not found", "invoice_not_found");
  if (detail.invoice.status !== "open" && detail.invoice.status !== "rejected") {
    return fail(
      `Cannot submit — invoice is ${detail.invoice.status.replace("_", " ")}`,
      "invoice_wrong_status",
    );
  }

  const file = form.get("receipt");
  if (!(file instanceof File)) return fail("Receipt image is required", "validation_failed");

  const upload = await uploadInvoiceReceipt({ invoiceId: parsed.data.invoiceId, file });
  if (!upload.ok) {
    return { ok: false, code: upload.error.code, message: upload.error.message };
  }

  try {
    await submitInvoicePayment({
      invoiceId: parsed.data.invoiceId,
      ownerId: profile.id,
      receiptImagePath: upload.data.path,
      receiptHash: upload.data.hashHex,
      amountPaidCentavos: detail.invoice.totalCentavos,
      ...(parsed.data.gcashReferenceNumber !== undefined && {
        gcashReferenceNumber: parsed.data.gcashReferenceNumber,
      }),
    });
  } catch (err) {
    return unwrap(err);
  }

  // Email notification to admin verification queue ships in a future slice.

  revalidatePath(`/owner/invoices/${parsed.data.invoiceId}`);
  revalidatePath("/owner/invoices");
  revalidatePath("/owner");
  return { ok: true, data: null };
}
