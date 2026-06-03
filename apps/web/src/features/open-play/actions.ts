"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionResult } from "@/features/auth";
import { getCurrentUser } from "@/features/auth/service";
import { uploadSignupReceipt } from "@/features/storage";
import { checkRateLimit, limiters, rateLimitMessage } from "@/lib/rate-limit";
import { captureException } from "@/lib/observability";
import { isOpenPlayError } from "./errors";
import {
  notifyOpenPlayCancelledByOwner,
  notifyOpenPlayJoinConfirmed,
  notifyOpenPlayJoinPending,
  notifyOpenPlaySignupPaymentSubmitted,
} from "./notifications";
import {
  cancelSession,
  cancelSignup,
  createSession,
  joinSession,
  publishSession,
  rejectSignupPayment,
  submitSignupPayment,
  updateSession,
  verifySignupPayment,
} from "./service";
import {
  cancelSessionInputSchema,
  cancelSignupInputSchema,
  createSessionInputSchema,
  joinSessionInputSchema,
  publishSessionInputSchema,
  rejectSignupPaymentInputSchema,
  updateSessionInputSchema,
  verifySignupPaymentInputSchema,
} from "./schema";
import { findSignupById } from "./repo";

/**
 * Server actions for the open-play feature. Each action:
 *   1. Authenticates via Supabase session
 *   2. Validates the FormData / input shape with Zod
 *   3. Delegates to the service layer (re-checks authz inside)
 *   4. Schedules notifications via `after()` so emails never block the response
 *   5. Revalidates affected paths
 *
 * NEVER throws — always returns a typed `ActionResult` the client can switch on.
 */

function fail(message: string, code = "unknown"): ActionResult<never> {
  return { ok: false, code, message };
}

function unwrap(err: unknown): ActionResult<never> {
  if (isOpenPlayError(err)) {
    return { ok: false, code: err.code, message: err.message };
  }
  captureException(err, { scope: "open-play.action" });
  console.error("[open-play.action] unhandled error:", err);
  // Surface the real cause so we can diagnose unexpected failures
  // (DB constraint violations, RLS denials, network errors, etc.) instead of
  // the opaque "Something went wrong" message. Owner-only actions — safe to show.
  // Walk the cause chain to find the deepest message (Drizzle wraps PG errors).
  const parts: string[] = [];
  let cur: unknown = err;
  const seen = new Set<unknown>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur instanceof Error) {
      const pg = cur as Error & { code?: string; detail?: string };
      const tag = pg.code ? `[${pg.code}] ` : "";
      const detail = pg.detail ? ` — ${pg.detail}` : "";
      parts.push(`${tag}${cur.name}: ${cur.message}${detail}`);
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return fail(`Something went wrong: ${parts.join(" → ")}`);
}

function dateFromForm(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // <input type="datetime-local"> returns "YYYY-MM-DDTHH:mm" with NO timezone.
  // The user is entering venue-local time (Asia/Manila, UTC+8). If we let
  // the server's `new Date()` parse it, it interprets the string as the
  // server's local time (UTC on Vercel) — shifting every booking by 8 hours.
  // Explicitly anchor to +08:00 so what the owner picks is what gets stored.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00+08:00`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value}+08:00`
      : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Convert a peso amount string (e.g. "150" or "150.50") into bigint centavos.
// Returns null on invalid / negative input.
function centavosFromPesoForm(value: FormDataEntryValue | null): bigint | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return BigInt(Math.round(n * 100));
}

// ===========================================================================
// Owner: create / update / publish / cancel
// ===========================================================================

export async function createSessionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult<{ sessionId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const price = centavosFromPesoForm(form.get("pricePhp"));
  const startAt = dateFromForm(form.get("startAt"));
  const endAt = dateFromForm(form.get("endAt"));
  if (price === null) return fail("Price is required", "validation_failed");
  if (!startAt || !endAt) return fail("Start and end time are required", "validation_failed");

  const description = form.get("description");
  const parsed = createSessionInputSchema.safeParse({
    ownerId: user.id,
    venueId: form.get("venueId"),
    // Multi-select: `courtId` is sent once per selected court.
    courtIds: form.getAll("courtId").filter((v): v is string => typeof v === "string"),
    title: form.get("title"),
    description: typeof description === "string" && description.length > 0 ? description : null,
    skillLevel: form.get("skillLevel") ?? "any",
    capacity: Number(form.get("capacity")),
    pricePerPlayerCentavos: price,
    startAt,
    endAt,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const session = await createSession(parsed.data);
    revalidatePath(`/owner/venues/${parsed.data.venueId}/open-play`);
    return { ok: true, data: { sessionId: session.id } };
  } catch (err) {
    return unwrap(err);
  }
}

export async function updateSessionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const price = form.get("pricePhp");
  const capacity = form.get("capacity");
  const description = form.get("description");
  const skillLevel = form.get("skillLevel");
  const title = form.get("title");

  const priceCentavos = centavosFromPesoForm(price);

  const parsed = updateSessionInputSchema.safeParse({
    ownerId: user.id,
    sessionId: form.get("sessionId"),
    ...(typeof title === "string" && { title }),
    ...(typeof description === "string" && { description }),
    ...(typeof skillLevel === "string" && { skillLevel }),
    ...(typeof capacity === "string" && capacity.length > 0 && { capacity: Number(capacity) }),
    ...(priceCentavos !== null && { pricePerPlayerCentavos: priceCentavos }),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const session = await updateSession(parsed.data);
    revalidatePath(`/owner/venues/${session.venueId}/open-play`);
    revalidatePath(`/owner/open-play/${session.id}`);
    return { ok: true, data: null };
  } catch (err) {
    return unwrap(err);
  }
}

export async function publishSessionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const parsed = publishSessionInputSchema.safeParse({
    ownerId: user.id,
    sessionId: form.get("sessionId"),
  });
  if (!parsed.success) return fail("Invalid input", "validation_failed");

  try {
    const session = await publishSession(parsed.data);
    revalidatePath(`/owner/venues/${session.venueId}/open-play`);
    revalidatePath(`/owner/open-play/${session.id}`);
    revalidatePath(`/open-play`);
    revalidatePath(`/open-play/${session.id}`);
    return { ok: true, data: null };
  } catch (err) {
    return unwrap(err);
  }
}

export async function cancelSessionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const reasonRaw = form.get("reason");
  const parsed = cancelSessionInputSchema.safeParse({
    ownerId: user.id,
    sessionId: form.get("sessionId"),
    ...(typeof reasonRaw === "string" && reasonRaw.length > 0 && { reason: reasonRaw }),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { session, cancelledSignupIds } = await cancelSession(parsed.data);
    after(async () => {
      await notifyOpenPlayCancelledByOwner({
        sessionId: session.id,
        signupIds: cancelledSignupIds,
        reason: parsed.data.reason ?? "Cancelled by venue owner",
      });
    });
    revalidatePath(`/owner/venues/${session.venueId}/open-play`);
    revalidatePath(`/owner/open-play/${session.id}`);
    revalidatePath(`/open-play`);
    revalidatePath(`/open-play/${session.id}`);
    return { ok: true, data: null };
  } catch (err) {
    return unwrap(err);
  }
}

// ===========================================================================
// Player: join / cancel signup / submit receipt
// ===========================================================================

export async function joinSessionAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult<{ signupId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in to join", "not_authorized");

  const rl = await checkRateLimit(limiters.bookingCreate, `open-play-join:${user.id}`);
  if (!rl.allowed) return fail(rateLimitMessage(rl.resetMs), "rate_limited");

  const contact = form.get("contactEmail");
  const parsed = joinSessionInputSchema.safeParse({
    playerId: user.id,
    sessionId: form.get("sessionId"),
    ...(typeof contact === "string" && contact.length > 0 && { contactEmail: contact }),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let signupId: string;
  try {
    const signup = await joinSession(parsed.data);
    signupId = signup.id;
    after(async () => {
      await notifyOpenPlayJoinPending(signup.id);
    });
    revalidatePath(`/open-play/${parsed.data.sessionId}`);
    revalidatePath(`/me/open-play`);
  } catch (err) {
    return unwrap(err);
  }
  // Server-side redirect: takes the user STRAIGHT to the GCash receipt form.
  // `redirect()` throws NEXT_REDIRECT — must be outside try/catch above.
  redirect(`/open-play/signups/${signupId}/pay`);
}

export async function cancelSignupAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const parsed = cancelSignupInputSchema.safeParse({
    playerId: user.id,
    signupId: form.get("signupId"),
  });
  if (!parsed.success) return fail("Invalid input", "validation_failed");

  try {
    await cancelSignup(parsed.data);
    revalidatePath("/me/open-play");
    return { ok: true, data: null };
  } catch (err) {
    return unwrap(err);
  }
}

const submitReceiptSchema = z.object({
  signupId: z.string().uuid(),
  gcashReferenceNumber: z
    .string()
    .trim()
    .min(1, "GCash reference number is required")
    .min(6, "GCash reference must be at least 6 characters")
    .max(20, "GCash reference must be 20 characters or less"),
  gcashSenderMobile: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "Enter a valid GCash number (e.g. 09171234567)"),
});

export async function submitSignupReceiptAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const rl = await checkRateLimit(limiters.receiptUpload, `open-play-receipt:${user.id}`);
  if (!rl.allowed) return fail(rateLimitMessage(rl.resetMs), "rate_limited");

  const ref = form.get("gcashReferenceNumber");
  const mobile = form.get("gcashSenderMobile");
  const parsed = submitReceiptSchema.safeParse({
    signupId: form.get("signupId"),
    gcashReferenceNumber: typeof ref === "string" ? ref : "",
    gcashSenderMobile: typeof mobile === "string" ? mobile : "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Please check the form",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const signup = await findSignupById(parsed.data.signupId);
  if (!signup) return fail("Signup not found", "signup_not_found");
  if (signup.playerId !== user.id) return fail("Not authorized", "not_authorized");
  if (signup.status !== "pending_payment") {
    return fail(
      `Cannot submit — signup is ${signup.status.replace("_", " ")}`,
      "signup_wrong_status",
    );
  }

  const file = form.get("receipt");
  if (!(file instanceof File)) return fail("Receipt image is required", "file_required");

  try {
    const upload = await uploadSignupReceipt({ signupId: parsed.data.signupId, file });
    if (!upload.ok) {
      return { ok: false, code: upload.error.code, message: upload.error.message };
    }

    await submitSignupPayment({
      signupId: parsed.data.signupId,
      playerId: user.id,
      receiptImagePath: upload.data.path,
      receiptHash: upload.data.hashHex,
      amountCentavos: signup.totalCentavos,
      gcashReferenceNumber: parsed.data.gcashReferenceNumber,
      gcashSenderMobile: parsed.data.gcashSenderMobile,
    });
  } catch (err) {
    return unwrap(err);
  }

  const submittedSignupId = parsed.data.signupId;
  after(async () => {
    await notifyOpenPlaySignupPaymentSubmitted(submittedSignupId);
  });

  revalidatePath(`/open-play/signups/${submittedSignupId}/pay`);
  revalidatePath("/me/open-play");
  return { ok: true, data: null };
}

// ===========================================================================
// Owner: verify / reject signup payment
// ===========================================================================

export async function verifySignupPaymentAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const parsed = verifySignupPaymentInputSchema.safeParse({
    verifierId: user.id,
    paymentId: form.get("paymentId"),
  });
  if (!parsed.success) return fail("Invalid input", "validation_failed");

  let signupIdForNotify: string | null = null;
  try {
    const payment = await verifySignupPayment(parsed.data);
    signupIdForNotify = payment.signupId;
  } catch (err) {
    return unwrap(err);
  }

  if (signupIdForNotify) {
    const id = signupIdForNotify;
    after(async () => {
      await notifyOpenPlayJoinConfirmed(id);
    });
  }

  revalidatePath("/owner");
  return { ok: true, data: null };
}

export async function rejectSignupPaymentAction(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in", "not_authorized");

  const parsed = rejectSignupPaymentInputSchema.safeParse({
    verifierId: user.id,
    paymentId: form.get("paymentId"),
    reason: form.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      message: "Reason required",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await rejectSignupPayment(parsed.data);
  } catch (err) {
    return unwrap(err);
  }

  revalidatePath("/owner");
  return { ok: true, data: null };
}
