import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { AutoValidationFailureCode } from "@/features/booking/auto-validation";
import { openPlaySessions, openPlaySignups, venues } from "@/db/schema";
import type {
  Booking,
  NewBooking,
  NewLedgerEntry,
  NewOpenPlaySession,
  NewOpenPlaySignup,
  NewOpenPlaySignupPayment,
  OpenPlaySession,
  OpenPlaySignup,
  OpenPlaySignupPayment,
} from "@/db/schema";
import { getCurrentBookingFeeRule } from "@/features/system-settings/service";
import { OpenPlayError } from "./errors";
import * as repo from "./repo";
import {
  cancelSessionInputSchema,
  cancelSignupInputSchema,
  createSessionInputSchema,
  joinSessionInputSchema,
  publishSessionInputSchema,
  rejectSignupPaymentInputSchema,
  submitSignupPaymentInputSchema,
  updateSessionInputSchema,
  verifySignupPaymentInputSchema,
  type CancelSessionInput,
  type CancelSignupInput,
  type CreateSessionInput,
  type JoinSessionInput,
  type PublishSessionInput,
  type RejectSignupPaymentInput,
  type SubmitSignupPaymentInput,
  type UpdateSessionInput,
  type VerifySignupPaymentInput,
} from "./schema";

/**
 * Open-play service. All public business operations live here.
 *
 * Authorization model:
 *   - Owner ops: caller's id must equal venues.owner_id (re-checked server-side).
 *   - Player ops: caller's id must equal openPlaySignups.player_id.
 *
 * Concurrency model:
 *   - The shadow `bookings` row uses the existing EXCLUDE constraint, so two
 *     overlapping published sessions on the same court are physically rejected.
 *   - Capacity is enforced by the `ops_check_capacity()` DB trigger — concurrent
 *     joins can never oversubscribe.
 *   - Optimistic concurrency via `version` on every mutating UPDATE.
 */

const CANCEL_WINDOW_MS = 15 * 60_000;
const PAYMENT_DUE_TTL_MS = 15 * 60_000;

const PG_EXCLUSION_VIOLATION = "23P01";
const PG_UNIQUE_VIOLATION = "23505";
const PG_CHECK_VIOLATION = "23514";

function isPgError(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: unknown }).code === code) return true;
  if ("cause" in err) return isPgError((err as { cause: unknown }).cause, code);
  return false;
}

function isCapacityError(err: unknown): boolean {
  // The trigger raises a CHECK violation with message 'open play session is full'.
  if (!isPgError(err, PG_CHECK_VIOLATION)) return false;
  if (typeof err !== "object" || err === null) return false;
  const messageHolder =
    "message" in err
      ? (err as { message: unknown }).message
      : "cause" in err && typeof (err as { cause: unknown }).cause === "object"
        ? ((err as { cause: { message?: unknown } }).cause.message as unknown)
        : undefined;
  return typeof messageHolder === "string" && messageHolder.includes("open play session is full");
}

function addMilliseconds(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

async function assertOwnsVenue(venueId: string, ownerId: string): Promise<void> {
  const rows = await db
    .select({ ownerId: venues.ownerId, status: venues.status, deletedAt: venues.deletedAt })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new OpenPlayError("venue_not_found", "Venue does not exist");
  if (row.ownerId !== ownerId) {
    throw new OpenPlayError("not_authorized", "You don't own this venue");
  }
  if (row.deletedAt || row.status !== "active") {
    throw new OpenPlayError("venue_inactive", "Venue is not accepting sessions");
  }
}

// ============================================================================
// 1. createSession — owner creates a DRAFT session (no shadow booking yet)
// ============================================================================
export async function createSession(input: CreateSessionInput): Promise<OpenPlaySession> {
  const parsed = createSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OpenPlayError("validation_failed", "Invalid session input", {
      issues: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  if (data.startAt.getTime() <= Date.now()) {
    throw new OpenPlayError("validation_failed", "startAt must be in the future");
  }

  await assertOwnsVenue(data.venueId, data.ownerId);

  // Validate EVERY selected court belongs to the venue and is open.
  for (const courtId of data.courtIds) {
    const courtRow = await repo.findCourtById(courtId);
    if (!courtRow) throw new OpenPlayError("court_not_found", "Court does not exist");
    if (courtRow.venue.id !== data.venueId) {
      throw new OpenPlayError("not_authorized", "Court does not belong to this venue");
    }
    if (!courtRow.court.isActive || courtRow.court.deletedAt) {
      throw new OpenPlayError("court_inactive", `Court ${courtRow.court.name} is not bookable`);
    }
    if (await repo.hasActiveClosureInRange({ courtId, startAt: data.startAt, endAt: data.endAt })) {
      throw new OpenPlayError(
        "court_closed",
        `Court ${courtRow.court.name} is closed during this time window`,
      );
    }
  }

  const feeRule = await getCurrentBookingFeeRule().catch(() => null);
  if (!feeRule) {
    throw new OpenPlayError("system_fee_unavailable", "No active booking fee configured");
  }

  // First selected court is the "primary" — mirrored into the legacy
  // `open_play_sessions.court_id` column so existing reads keep working.
  const primaryCourtId = data.courtIds[0]!;

  return db.transaction(async (tx) => {
    const session = await repo.insertSession(
      {
        venueId: data.venueId,
        courtId: primaryCourtId,
        hostProfileId: data.ownerId,
        title: data.title,
        description: data.description ?? null,
        skillLevel: data.skillLevel,
        capacity: data.capacity,
        pricePerPlayerCentavos: data.pricePerPlayerCentavos,
        systemFeePerPlayerCentavos: feeRule.snapshotCentavos,
        startAt: data.startAt,
        endAt: data.endAt,
        status: "draft",
      } as NewOpenPlaySession,
      tx,
    );
    await repo.insertSessionCourts(session.id, data.courtIds, tx);
    return session;
  });
}

// ============================================================================
// 2. updateSession — owner edits a DRAFT session
// ============================================================================
export async function updateSession(input: UpdateSessionInput): Promise<OpenPlaySession> {
  const parsed = updateSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OpenPlayError("validation_failed", "Invalid update input");
  }
  const data = parsed.data;

  const session = await repo.findSessionById(data.sessionId);
  if (!session) throw new OpenPlayError("session_not_found", "Session does not exist");
  await assertOwnsVenue(session.venueId, data.ownerId);

  if (session.status !== "draft") {
    throw new OpenPlayError(
      "session_wrong_status",
      "Only draft sessions can be edited",
    );
  }

  const patch: Parameters<typeof repo.updateSession>[2] = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.skillLevel !== undefined) patch.skillLevel = data.skillLevel;
  if (data.capacity !== undefined) patch.capacity = data.capacity;
  if (data.pricePerPlayerCentavos !== undefined) {
    patch.pricePerPlayerCentavos = data.pricePerPlayerCentavos;
  }

  const updated = await repo.updateSession(data.sessionId, session.version, patch);
  if (!updated) {
    throw new OpenPlayError("concurrent_modification", "Session was modified by another request");
  }
  return updated;
}

// ============================================================================
// 3. publishSession — flips DRAFT → PUBLISHED, inserts the shadow booking
// ============================================================================
export async function publishSession(input: PublishSessionInput): Promise<OpenPlaySession> {
  const parsed = publishSessionInputSchema.safeParse(input);
  if (!parsed.success) throw new OpenPlayError("validation_failed", "Invalid input");

  const session = await repo.findSessionById(parsed.data.sessionId);
  if (!session) throw new OpenPlayError("session_not_found", "Session does not exist");
  await assertOwnsVenue(session.venueId, parsed.data.ownerId);

  if (session.status !== "draft") {
    throw new OpenPlayError("session_wrong_status", "Only draft sessions can be published");
  }
  if (session.startAt.getTime() <= Date.now()) {
    throw new OpenPlayError("session_already_started", "Session start time has already passed");
  }

  // Re-snapshot the system fee at publish time — captures admin updates made
  // after the draft was first created.
  const feeRule = await getCurrentBookingFeeRule().catch(() => null);
  if (!feeRule) {
    throw new OpenPlayError("system_fee_unavailable", "No active booking fee configured");
  }

  return db.transaction(async (tx) => {
    // Pull the canonical court list from the join table. If a draft predates
    // the multi-court migration and has no rows yet, seed from the legacy
    // primary courtId so publish still works.
    let joinRows = await repo.listSessionCourtRows(session.id, tx);
    if (joinRows.length === 0) {
      await repo.insertSessionCourts(session.id, [session.courtId], tx);
      joinRows = [{ courtId: session.courtId, shadowBookingId: null }];
    }

    // Insert one shadow booking per court. Any EXCLUDE violation rolls back
    // the whole transaction — partial publishes never happen.
    let primaryShadowId: string | null = null;
    for (const row of joinRows) {
      let shadow: Booking;
      try {
        shadow = await repo.insertShadowBooking(
          {
            playerId: parsed.data.ownerId,
            courtId: row.courtId,
            venueId: session.venueId,
            startAt: session.startAt,
            endAt: session.endAt,
            status: "open_play",
            courtFeeCentavos: 0n,
            systemFeeCentavos: 0n,
            cancellableUntil: session.endAt,
            paymentDueAt: session.endAt,
            notes: `[open-play] ${session.title}`,
          } as NewBooking,
          tx,
        );
      } catch (err) {
        if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
          throw new OpenPlayError(
            "slot_not_available",
            "One of the selected courts is already booked for this time window",
          );
        }
        throw err;
      }
      await repo.setSessionCourtShadow(session.id, row.courtId, shadow.id, tx);
      if (row.courtId === session.courtId) primaryShadowId = shadow.id;
    }

    // Fall back to the first shadow if the primary somehow wasn't in the join
    // set (defensive — shouldn't happen given the seeding above).
    if (primaryShadowId === null) {
      const fresh = await repo.listSessionCourtRows(session.id, tx);
      primaryShadowId = fresh[0]?.shadowBookingId ?? null;
    }

    const updated = await repo.updateSession(
      session.id,
      session.version,
      {
        status: "published",
        publishedAt: new Date(),
        shadowBookingId: primaryShadowId,
        systemFeePerPlayerCentavos: feeRule.snapshotCentavos,
      },
      tx,
    );
    if (!updated) {
      throw new OpenPlayError("concurrent_modification", "Session was modified by another request");
    }
    return updated;
  });
}

// ============================================================================
// 4. cancelSession — owner cancels; shadow booking is cancelled too
//    Active signups are auto-cancelled by the same transaction.
// ============================================================================
export async function cancelSession(
  input: CancelSessionInput,
): Promise<{ session: OpenPlaySession; cancelledSignupIds: string[] }> {
  const parsed = cancelSessionInputSchema.safeParse(input);
  if (!parsed.success) throw new OpenPlayError("validation_failed", "Invalid input");

  const session = await repo.findSessionById(parsed.data.sessionId);
  if (!session) throw new OpenPlayError("session_not_found", "Session does not exist");
  await assertOwnsVenue(session.venueId, parsed.data.ownerId);

  if (session.status === "cancelled") return { session, cancelledSignupIds: [] };
  if (session.status === "completed") {
    throw new OpenPlayError("session_wrong_status", "Completed sessions cannot be cancelled");
  }

  const reason = parsed.data.reason ?? "Cancelled by venue owner";
  const now = new Date();

  return db.transaction(async (tx) => {
    // 1. Free every per-court shadow booking. Fall back to the legacy single
    //    shadow_booking_id when no join rows exist (pre-migration drafts).
    const joinRows = await repo.listSessionCourtRows(session.id, tx);
    const shadowIds = joinRows
      .map((r) => r.shadowBookingId)
      .filter((id): id is string => id !== null);
    if (shadowIds.length === 0 && session.shadowBookingId) {
      shadowIds.push(session.shadowBookingId);
    }
    for (const shadowId of shadowIds) {
      await repo.cancelShadowBooking(shadowId, parsed.data.ownerId, reason, tx);
    }

    // 2. Cancel every active signup so players see it in /me/open-play.
    const signupsCancelled = await tx
      .update(openPlaySignups)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: parsed.data.ownerId,
        cancellationReason: reason,
      })
      .where(eq(openPlaySignups.sessionId, session.id))
      .returning({ id: openPlaySignups.id });

    // 3. Flip the session itself.
    const updated = await repo.updateSession(
      session.id,
      session.version,
      {
        status: "cancelled",
        cancelledAt: now,
        cancelledBy: parsed.data.ownerId,
        cancellationReason: reason,
      },
      tx,
    );
    if (!updated) {
      throw new OpenPlayError("concurrent_modification", "Session was modified by another request");
    }

    return {
      session: updated,
      cancelledSignupIds: signupsCancelled.map((s) => s.id),
    };
  });
}

// ============================================================================
// 5. joinSession — player joins a published session
// ============================================================================
export async function joinSession(input: JoinSessionInput): Promise<OpenPlaySignup> {
  const parsed = joinSessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OpenPlayError("validation_failed", "Invalid join input", {
      issues: parsed.error.flatten(),
    });
  }
  const { playerId, sessionId, contactEmail } = parsed.data;

  const session = await repo.findSessionById(sessionId);
  if (!session) throw new OpenPlayError("session_not_found", "Session does not exist");
  if (session.status !== "published") {
    throw new OpenPlayError("session_not_published", "Session is not open for joining");
  }
  if (session.startAt.getTime() <= Date.now()) {
    throw new OpenPlayError("session_already_started", "Session has already started");
  }

  const now = new Date();

  try {
    return await repo.insertSignup({
      sessionId,
      playerId,
      status: "pending_payment",
      courtFeeCentavos: session.pricePerPlayerCentavos,
      systemFeeCentavos: session.systemFeePerPlayerCentavos,
      contactEmail: contactEmail ?? null,
      cancellableUntil: addMilliseconds(now, CANCEL_WINDOW_MS),
      paymentDueAt: addMilliseconds(now, PAYMENT_DUE_TTL_MS),
    } as NewOpenPlaySignup);
  } catch (err) {
    if (isCapacityError(err)) {
      throw new OpenPlayError("session_full", "This session is full");
    }
    if (isPgError(err, PG_UNIQUE_VIOLATION)) {
      throw new OpenPlayError("already_signed_up", "You already have an active signup for this session");
    }
    throw err;
  }
}

// ============================================================================
// 6. cancelSignup — player self-cancels within the 15-min window
// ============================================================================
export async function cancelSignup(input: CancelSignupInput): Promise<OpenPlaySignup> {
  const parsed = cancelSignupInputSchema.safeParse(input);
  if (!parsed.success) throw new OpenPlayError("validation_failed", "Invalid input");

  const signup = await repo.findSignupById(parsed.data.signupId);
  if (!signup) throw new OpenPlayError("signup_not_found", "Signup does not exist");
  if (signup.playerId !== parsed.data.playerId) {
    throw new OpenPlayError("signup_not_owned", "Signup belongs to a different player");
  }
  if (signup.status === "cancelled") return signup;
  if (signup.status === "expired" || signup.status === "refunded") {
    throw new OpenPlayError("signup_wrong_status", "Signup cannot be cancelled");
  }
  if (signup.cancellableUntil.getTime() <= Date.now()) {
    throw new OpenPlayError(
      "signup_not_cancellable",
      "The 15-minute cancellation window has elapsed",
    );
  }

  const updated = await repo.updateSignup(signup.id, signup.version, {
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: parsed.data.playerId,
    cancellationReason: "Player self-cancel",
  });
  if (!updated) {
    throw new OpenPlayError("concurrent_modification", "Signup was modified by another request");
  }
  return updated;
}

// ============================================================================
// 7. submitSignupPayment — player uploads GCash receipt
// ============================================================================
export async function submitSignupPayment(
  input: SubmitSignupPaymentInput,
): Promise<OpenPlaySignupPayment> {
  const parsed = submitSignupPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new OpenPlayError("validation_failed", "Invalid payment input", {
      issues: parsed.error.flatten(),
    });
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const signup = await repo.findSignupById(data.signupId, tx);
    if (!signup) throw new OpenPlayError("signup_not_found", "Signup does not exist");
    if (signup.playerId !== data.playerId) {
      throw new OpenPlayError("signup_not_owned", "Signup belongs to a different player");
    }
    if (signup.status !== "pending_payment") {
      throw new OpenPlayError(
        "signup_wrong_status",
        `Cannot submit — signup is ${signup.status.replace("_", " ")}`,
      );
    }
    if (data.amountCentavos !== signup.totalCentavos) {
      throw new OpenPlayError(
        "validation_failed",
        "Amount does not match the signup total",
      );
    }

    let payment: OpenPlaySignupPayment;
    try {
      payment = await repo.insertSignupPayment(
        {
          signupId: data.signupId,
          receiptImagePath: data.receiptImagePath,
          receiptHash: data.receiptHash,
          amountCentavos: data.amountCentavos,
          gcashReferenceNumber: data.gcashReferenceNumber ?? null,
          status: "submitted",
          submittedBy: data.playerId,
        } as NewOpenPlaySignupPayment,
        tx,
      );
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION)) {
        throw new OpenPlayError("duplicate_receipt", "This receipt has already been submitted");
      }
      throw err;
    }

    const updated = await repo.updateSignup(signup.id, signup.version, {
      status: "payment_submitted",
    }, tx);
    if (!updated) {
      throw new OpenPlayError("concurrent_modification", "Signup was modified by another request");
    }

    // ------------------------------------------------------------------
    // Receipt auto-validation (mirrors features/booking → submitPayment).
    // 5 cheap heuristics. Empty failures + sufficient lead time schedule
    // the signup for SLA auto-confirm at T-30m from session.startAt.
    // ------------------------------------------------------------------
    const session = await repo.findSessionById(signup.sessionId, tx);
    if (!session) throw new OpenPlayError("session_not_found", "Session does not exist");
    const now = await repo.getDatabaseNow(tx);

    const failures: AutoValidationFailureCode[] = [];
    const ref = data.gcashReferenceNumber ?? "";
    if (!/^\d{10,16}$/.test(ref)) failures.push("ref_format");
    if (
      ref &&
      (await repo.findRecentSignupRefDuplicate(ref, 90, payment.id, tx))
    ) {
      failures.push("ref_duplicate");
    }
    if (await repo.findRecentSignupHashReplay(data.receiptHash, 90, payment.id, tx)) {
      failures.push("hash_replay");
    }
    const lateBoundary = new Date(session.startAt.getTime() + 30 * 60_000);
    if (now > lateBoundary) failures.push("window_late");
    if (now < signup.createdAt) failures.push("window_early");

    const stamped = await repo.markSignupAutoValidated(
      payment.id,
      payment.version,
      failures,
      tx,
    );
    if (!stamped) {
      throw new OpenPlayError(
        "concurrent_modification",
        "Payment was modified by another request",
      );
    }

    if (failures.length === 0) {
      const autoConfirmAt = new Date(session.startAt.getTime() - 30 * 60_000);
      const minLeadMs = 10 * 60_000;
      if (autoConfirmAt.getTime() - now.getTime() > minLeadMs) {
        await repo.setSignupAutoConfirmAt(updated.id, updated.version, autoConfirmAt, tx);
      }
    }

    return stamped;
  });
}

// ============================================================================
// 8. verifySignupPayment — owner marks a payment as verified
// ============================================================================

/**
 * Open-play analogue of features/booking/service.ts → confirmBookingAndWriteLedger.
 *
 * Atomically flips the payment to 'verified' and the signup to 'confirmed',
 * then writes the three ledger entries that credit the venue + platform
 * revenue and debit platform cash. Before migration 0031 the open-play
 * verify path skipped the ledger entirely, so every confirmed open-play
 * signup was invisible to payouts and owner invoices.
 *
 * Callers MUST:
 *   - run inside a single transaction (`tx`)
 *   - re-check authorization before calling
 *   - pass freshly-read `signup` + `payment` rows from inside `tx`
 *   - ensure `payment.status` is in a verifiable state (i.e. 'submitted')
 *
 * Idempotency keys include `prefix` so the same signup can carry an audit
 * trail across owner/auto/late confirm paths without colliding (mirrors
 * the booking path's `bk:` / `auto:` / `late:` prefixes).
 */
type LedgerActor = { id: string | null; kind: "owner" | "system" | "admin" };

async function confirmSignupAndWriteLedger(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  signup: OpenPlaySignup,
  payment: OpenPlaySignupPayment,
  now: Date,
  actor: LedgerActor,
  options?: { idempotencyPrefix?: string; descriptionTag?: string },
): Promise<{ signup: OpenPlaySignup; payment: OpenPlaySignupPayment }> {
  const idemPrefix = options?.idempotencyPrefix ?? "ops";
  const tag = options?.descriptionTag ? `${options.descriptionTag} ` : "";

  const verifiedPayment = await repo.updateSignupPayment(
    payment.id,
    payment.version,
    {
      status: "verified",
      verifiedBy: actor.id,
      verifiedAt: now,
    },
    tx,
  );
  if (!verifiedPayment) {
    throw new OpenPlayError(
      "concurrent_modification",
      "Payment was modified by another request",
    );
  }

  const confirmedSignup = await repo.updateSignup(
    signup.id,
    signup.version,
    { status: "confirmed" },
    tx,
  );
  if (!confirmedSignup) {
    throw new OpenPlayError(
      "concurrent_modification",
      "Signup was modified by another request",
    );
  }

  // Double-entry: venue is owed the court fee; platform earns the system fee.
  // Sum of debits === sum of credits === total_centavos. Zero-amount entries
  // are filtered (e.g. waived system fee) — the ledger CHECK requires >= 1.
  const allEntries: NewLedgerEntry[] = [
    {
      openPlaySignupId: signup.id,
      account: "venue_payable",
      direction: "credit",
      amountCentavos: signup.courtFeeCentavos,
      description: `${tag}Court fee owed to venue for open play signup ${signup.id}`,
      idempotencyKey: `${idemPrefix}:${signup.id}:venue_payable`,
      createdBy: actor.id,
    },
    {
      openPlaySignupId: signup.id,
      account: "platform_revenue",
      direction: "credit",
      amountCentavos: signup.systemFeeCentavos,
      description: `${tag}System fee revenue for open play signup ${signup.id}`,
      idempotencyKey: `${idemPrefix}:${signup.id}:platform_revenue`,
      createdBy: actor.id,
    },
    {
      openPlaySignupId: signup.id,
      account: "platform_cash",
      direction: "debit",
      amountCentavos: signup.totalCentavos,
      description: `${tag}Cash received (held by venue) for open play signup ${signup.id}`,
      idempotencyKey: `${idemPrefix}:${signup.id}:platform_cash`,
      createdBy: actor.id,
    },
  ];
  const entries = allEntries.filter((e) => e.amountCentavos > 0n);
  await repo.insertLedgerEntries(entries, tx);

  return { signup: confirmedSignup, payment: verifiedPayment };
}

export async function verifySignupPayment(
  input: VerifySignupPaymentInput,
): Promise<OpenPlaySignupPayment> {
  const parsed = verifySignupPaymentInputSchema.safeParse(input);
  if (!parsed.success) throw new OpenPlayError("validation_failed", "Invalid input");

  return db.transaction(async (tx) => {
    const payment = await repo.findSignupPaymentById(parsed.data.paymentId, tx);
    if (!payment) throw new OpenPlayError("payment_not_found", "Payment does not exist");
    if (payment.status === "verified") {
      throw new OpenPlayError("payment_already_verified", "Payment is already verified");
    }

    const signup = await repo.findSignupById(payment.signupId, tx);
    if (!signup) throw new OpenPlayError("signup_not_found", "Signup does not exist");
    const sessionWithVenue = await repo.findSessionWithVenue(signup.sessionId, tx);
    if (!sessionWithVenue) throw new OpenPlayError("session_not_found", "Session does not exist");
    if (sessionWithVenue.venue.ownerId !== parsed.data.verifierId) {
      throw new OpenPlayError("not_authorized", "Only the venue owner can verify payments");
    }

    const now = await repo.getDatabaseNow(tx);
    const { payment: verifiedPayment } = await confirmSignupAndWriteLedger(
      tx,
      signup,
      payment,
      now,
      { id: parsed.data.verifierId, kind: "owner" },
    );
    return verifiedPayment;
  });
}

// ============================================================================
// 9. rejectSignupPayment — owner rejects, signup goes back to pending_payment
// ============================================================================
export async function rejectSignupPayment(
  input: RejectSignupPaymentInput,
): Promise<OpenPlaySignupPayment> {
  const parsed = rejectSignupPaymentInputSchema.safeParse(input);
  if (!parsed.success) throw new OpenPlayError("validation_failed", "Invalid input");

  return db.transaction(async (tx) => {
    const payment = await repo.findSignupPaymentById(parsed.data.paymentId, tx);
    if (!payment) throw new OpenPlayError("payment_not_found", "Payment does not exist");
    if (payment.status === "verified") {
      throw new OpenPlayError("payment_already_verified", "Cannot reject a verified payment");
    }

    const signup = await repo.findSignupById(payment.signupId, tx);
    if (!signup) throw new OpenPlayError("signup_not_found", "Signup does not exist");
    const sessionWithVenue = await repo.findSessionWithVenue(signup.sessionId, tx);
    if (!sessionWithVenue) throw new OpenPlayError("session_not_found", "Session does not exist");
    if (sessionWithVenue.venue.ownerId !== parsed.data.verifierId) {
      throw new OpenPlayError("not_authorized", "Only the venue owner can reject payments");
    }

    const updatedPayment = await repo.updateSignupPayment(payment.id, payment.version, {
      status: "rejected",
      verifiedBy: parsed.data.verifierId,
      verifiedAt: new Date(),
      rejectionReason: parsed.data.reason,
    }, tx);
    if (!updatedPayment) {
      throw new OpenPlayError("concurrent_modification", "Payment was modified by another request");
    }

    // Send the signup back to pending_payment so the player can re-upload.
    await repo.updateSignup(signup.id, signup.version, {
      status: "pending_payment",
    }, tx);

    return updatedPayment;
  });
}

// ============================================================================
// 10. Cron — T-2h reminder for confirmed signups
// ============================================================================
export async function sendOpenPlayReminders(): Promise<{ sent: number; expired: number }> {
  // Expire stale pending_payment signups so reminders aren't sent to them.
  const expired = await repo.expirePendingSignups();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 2.5 * 60 * 60_000);

  // Pull confirmed signups joined with their session; filter the time window
  // in JS — the volume per cron tick is bounded (a few sessions max).
  const candidates = await db
    .select({
      signupId: openPlaySignups.id,
      version: openPlaySignups.version,
      startAt: openPlaySessions.startAt,
      reminderSentAt: openPlaySignups.reminderSentAt,
    })
    .from(openPlaySignups)
    .innerJoin(openPlaySessions, eq(openPlaySessions.id, openPlaySignups.sessionId))
    .where(eq(openPlaySignups.status, "confirmed"));

  const due = candidates.filter(
    (r) =>
      r.reminderSentAt === null &&
      r.startAt.getTime() > now.getTime() &&
      r.startAt.getTime() <= windowEnd.getTime(),
  );

  let sent = 0;
  const { notifyOpenPlaySessionReminder } = await import("./notifications");
  for (const c of due) {
    const updated = await repo.updateSignup(c.signupId, c.version, {
      reminderSentAt: new Date(),
    });
    if (updated) {
      sent++;
      await notifyOpenPlaySessionReminder(c.signupId);
    }
  }
  return { sent, expired };
}

// ============================================================================
// 11. autoConfirmEligibleSignups — SLA cron (mirrors booking equivalent)
//
// Each signup is processed in its own transaction so a slow notify can't
// roll back ledger state. Notifies are dispatched OUTSIDE the tx for the
// same reason — an email outage must never undo a confirmed signup.
// ============================================================================
export async function autoConfirmEligibleSignups(
  limit = 100,
): Promise<{ confirmed: number; skipped: number }> {
  const candidates = await repo.findSignupsDueForAutoConfirm(limit);
  let confirmed = 0;
  let skipped = 0;
  const notifyTargets: string[] = [];

  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        const freshSignup = await repo.findSignupById(c.signupId, tx);
        const freshPayment = await repo.findSignupPaymentById(c.paymentId, tx);
        if (!freshSignup || !freshPayment) {
          skipped++;
          return;
        }
        if (
          freshSignup.status !== "payment_submitted" ||
          freshPayment.status !== "submitted"
        ) {
          skipped++;
          return;
        }

        const now = await repo.getDatabaseNow(tx);
        const { payment: confirmedPayment } = await confirmSignupAndWriteLedger(
          tx,
          freshSignup,
          freshPayment,
          now,
          { id: null, kind: "system" },
          { idempotencyPrefix: "auto", descriptionTag: "[AUTO]" },
        );
        const stamped = await repo.markSignupAutoConfirmed(
          confirmedPayment.id,
          confirmedPayment.version,
          "owner_silent_passed_validation",
          tx,
        );
        if (!stamped) {
          skipped++;
          return;
        }
        confirmed++;
        notifyTargets.push(freshSignup.id);
      });
    } catch {
      skipped++;
    }
  }

  if (notifyTargets.length > 0) {
    const { notifyOpenPlaySignupAutoConfirmed } = await import("./notifications");
    for (const signupId of notifyTargets) {
      await notifyOpenPlaySignupAutoConfirmed(signupId);
    }
  }

  return { confirmed, skipped };
}

// ============================================================================
// 12. sendOwnerSignupVerificationNudges — T-2h / T-30m owner reminders
//
// INVARIANT: stamp `owner_nudge{N}_sent_at` BEFORE the Resend send. One
// missed nudge is far better than a spam loop if Resend fails repeatedly.
// ============================================================================
export async function sendOwnerSignupVerificationNudges(): Promise<{
  nudge1: number;
  nudge2: number;
  skipped: number;
}> {
  const [nudge1Candidates, nudge2Candidates] = await Promise.all([
    repo.findSignupPaymentsDueForNudge1(),
    repo.findSignupPaymentsDueForNudge2(),
  ]);

  const { notifyOwnerSignupNudge1, notifyOwnerSignupNudge2 } = await import(
    "./notifications"
  );

  let nudge1 = 0;
  let nudge2 = 0;
  let skipped = 0;

  for (const c of nudge1Candidates) {
    const stamped = await repo.markSignupNudge1Sent(c.paymentId, c.paymentVersion);
    if (!stamped) {
      skipped++;
      continue;
    }
    try {
      await notifyOwnerSignupNudge1(c.signupId);
      nudge1++;
    } catch {
      skipped++;
    }
  }

  for (const c of nudge2Candidates) {
    const stamped = await repo.markSignupNudge2Sent(c.paymentId, c.paymentVersion);
    if (!stamped) {
      skipped++;
      continue;
    }
    try {
      await notifyOwnerSignupNudge2(c.signupId);
      nudge2++;
    } catch {
      skipped++;
    }
  }

  return { nudge1, nudge2, skipped };
}

// ============================================================================
// 13. lateConfirmSignupPayment — admin recovery path
//
// When a signup's session window has already ended but the receipt was never
// verified (owner forgot, heuristics failed, etc.) an admin can confirm after
// the fact. Ledger entries use the `late:` idempotency prefix so they cannot
// collide with a prior owner-verify (`ops:`) or auto-confirm (`auto:`).
//
// Caller (Server Action) MUST have already called requireAdmin().
// ============================================================================
export interface LateConfirmSignupPaymentInput {
  paymentId: string;
  adminId: string;
  reason: string;
}

export async function lateConfirmSignupPayment(
  input: LateConfirmSignupPaymentInput,
): Promise<OpenPlaySignupPayment> {
  if (!input.paymentId || !input.adminId || !input.reason.trim()) {
    throw new OpenPlayError("validation_failed", "Missing late-confirm input");
  }

  return db.transaction(async (tx) => {
    const now = await repo.getDatabaseNow(tx);
    const payment = await repo.findSignupPaymentById(input.paymentId, tx);
    if (!payment) throw new OpenPlayError("payment_not_found", "Payment not found");
    if (payment.status === "verified") {
      throw new OpenPlayError("payment_already_verified", "Payment is already verified");
    }
    if (payment.status !== "submitted") {
      throw new OpenPlayError(
        "validation_failed",
        `Cannot late-confirm a payment in status ${payment.status}`,
      );
    }

    const signup = await repo.findSignupById(payment.signupId, tx);
    if (!signup) throw new OpenPlayError("signup_not_found", "Signup not found");
    if (signup.status !== "payment_submitted") {
      throw new OpenPlayError(
        "validation_failed",
        `Cannot late-confirm — signup is ${signup.status.replace("_", " ")}`,
      );
    }

    const session = await repo.findSessionById(signup.sessionId, tx);
    if (!session) throw new OpenPlayError("session_not_found", "Session not found");
    if (session.endAt.getTime() > now.getTime()) {
      throw new OpenPlayError(
        "validation_failed",
        "Session is still in progress — wait until it ends before late-confirming",
      );
    }

    const { payment: confirmedPayment } = await confirmSignupAndWriteLedger(
      tx,
      signup,
      payment,
      now,
      { id: input.adminId, kind: "admin" },
      { idempotencyPrefix: "late", descriptionTag: "[LATE]" },
    );
    const stamped = await repo.markSignupLateConfirmed(
      confirmedPayment.id,
      confirmedPayment.version,
      input.adminId,
      input.reason,
      tx,
    );
    if (!stamped) {
      throw new OpenPlayError(
        "concurrent_modification",
        "Payment was modified by another request",
      );
    }
    return stamped;
  });
}
