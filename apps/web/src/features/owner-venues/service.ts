import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  courtClosures,
  courtHourlyRates,
  courts,
  venues,
  type Court,
  type CourtClosure,
  type CourtHourlyRate,
  type Venue,
} from "@/db/schema";
import { OwnerVenueError } from "./errors";
import {
  phpStringToCentavos,
  type CourtUpsertInput,
  type VenueStatusAction,
  type VenueUpsertInput,
} from "./schema";

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function generateUniqueSlug(base: string): Promise<string> {
  const baseSlug = slugify(base) || "venue";
  // Try base, then base-2, base-3, ...
  // 50 attempts is plenty given per-owner volume.
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    const existing = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  throw new OwnerVenueError("slug_taken", "Could not pick a unique URL — please change the name.");
}

async function loadVenueOwned(venueId: string, ownerId: string): Promise<Venue> {
  const rows = await db
    .select()
    .from(venues)
    .where(and(eq(venues.id, venueId), isNull(venues.deletedAt)))
    .limit(1);
  const v = rows[0];
  if (!v) throw new OwnerVenueError("venue_not_found", "Venue not found.");
  if (v.ownerId !== ownerId) {
    throw new OwnerVenueError("forbidden", "You do not have access to this venue.");
  }
  return v;
}

// ----------------------------------------------------------------------------
// list / read
// ----------------------------------------------------------------------------

export interface OwnerVenueListItem {
  venue: Venue;
  courtCount: number;
  activeCourtCount: number;
}

export async function listVenuesForOwner(ownerId: string): Promise<OwnerVenueListItem[]> {
  const rows = await db
    .select({
      venue: venues,
      courtCount: sql<number>`count(${courts.id}) filter (where ${courts.deletedAt} is null)::int`,
      activeCourtCount: sql<number>`count(${courts.id}) filter (where ${courts.deletedAt} is null and ${courts.isActive} = true)::int`,
    })
    .from(venues)
    .leftJoin(courts, eq(courts.venueId, venues.id))
    .where(and(eq(venues.ownerId, ownerId), isNull(venues.deletedAt)))
    .groupBy(venues.id)
    .orderBy(desc(venues.createdAt));
  return rows.map((r) => ({
    venue: r.venue,
    courtCount: r.courtCount,
    activeCourtCount: r.activeCourtCount,
  }));
}

export interface OwnerVenueWithCourts {
  venue: { id: string; name: string };
  courts: { id: string; name: string }[];
}

/**
 * Lightweight list of every owned venue + its active courts.
 * Used by the closure launcher so it can render without a per-venue round trip.
 */
export async function listVenuesWithActiveCourtsForOwner(
  ownerId: string,
): Promise<OwnerVenueWithCourts[]> {
  const rows = await db
    .select({
      venueId: venues.id,
      venueName: venues.name,
      courtId: courts.id,
      courtName: courts.name,
    })
    .from(venues)
    .leftJoin(
      courts,
      and(eq(courts.venueId, venues.id), eq(courts.isActive, true), isNull(courts.deletedAt)),
    )
    .where(and(eq(venues.ownerId, ownerId), isNull(venues.deletedAt)))
    .orderBy(asc(venues.name), asc(courts.name));

  const map = new Map<string, OwnerVenueWithCourts>();
  for (const r of rows) {
    let entry = map.get(r.venueId);
    if (!entry) {
      entry = { venue: { id: r.venueId, name: r.venueName }, courts: [] };
      map.set(r.venueId, entry);
    }
    if (r.courtId && r.courtName) {
      entry.courts.push({ id: r.courtId, name: r.courtName });
    }
  }
  return Array.from(map.values()).filter((v) => v.courts.length > 0);
}

export async function getVenueWithCourtsForOwner(
  venueId: string,
  ownerId: string,
): Promise<{ venue: Venue; courts: Court[] }> {
  const venue = await loadVenueOwned(venueId, ownerId);
  const courtRows = await db
    .select()
    .from(courts)
    .where(and(eq(courts.venueId, venue.id), isNull(courts.deletedAt)))
    .orderBy(desc(courts.isActive), asc(courts.name));
  return { venue, courts: courtRows };
}

/**
 * Lists active, non-deleted courts for a venue.
 * No ownership check — callers must have already verified access to the venue
 * (e.g., via findBookingForOwner or getVenueWithCourtsForOwner).
 */
export async function listActiveCourtsForVenue(venueId: string): Promise<Court[]> {
  return db
    .select()
    .from(courts)
    .where(
      and(eq(courts.venueId, venueId), eq(courts.isActive, true), isNull(courts.deletedAt)),
    )
    .orderBy(asc(courts.name));
}

export async function getCourtForOwner(
  courtId: string,
  ownerId: string,
): Promise<{ venue: Venue; court: Court }> {
  const rows = await db
    .select({ court: courts, venue: venues })
    .from(courts)
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(and(eq(courts.id, courtId), isNull(courts.deletedAt), isNull(venues.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new OwnerVenueError("court_not_found", "Court not found.");
  if (row.venue.ownerId !== ownerId) {
    throw new OwnerVenueError("forbidden", "You do not have access to this court.");
  }
  return { court: row.court, venue: row.venue };
}

// ----------------------------------------------------------------------------
// venue create / update
// ----------------------------------------------------------------------------

export async function createVenue(args: {
  ownerId: string;
  input: VenueUpsertInput;
}): Promise<Venue> {
  const slug = await generateUniqueSlug(args.input.name);
  const [created] = await db
    .insert(venues)
    .values({
      ownerId: args.ownerId,
      name: args.input.name,
      slug,
      description: args.input.description,
      addressLine: args.input.addressLine,
      city: args.input.city,
      province: args.input.province,
      postalCode: args.input.postalCode,
      latitude: args.input.latitude,
      longitude: args.input.longitude,
      gcashAccountName: args.input.gcashAccountName,
      gcashAccountNumber: args.input.gcashAccountNumber,
      gcashQrImagePath: args.input.gcashQrImagePath,
      coverImagePath: args.input.coverImagePath,
      status: "draft",
    })
    .returning();
  if (!created) throw new OwnerVenueError("unknown", "Failed to create venue.");
  return created;
}

export async function updateVenue(args: {
  ownerId: string;
  venueId: string;
  expectedVersion: number;
  input: VenueUpsertInput;
}): Promise<Venue> {
  const existing = await loadVenueOwned(args.venueId, args.ownerId);
  if (existing.version !== args.expectedVersion) {
    throw new OwnerVenueError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }
  const [updated] = await db
    .update(venues)
    .set({
      name: args.input.name,
      description: args.input.description,
      addressLine: args.input.addressLine,
      city: args.input.city,
      province: args.input.province,
      postalCode: args.input.postalCode,
      latitude: args.input.latitude,
      longitude: args.input.longitude,
      gcashAccountName: args.input.gcashAccountName,
      gcashAccountNumber: args.input.gcashAccountNumber,
      gcashQrImagePath: args.input.gcashQrImagePath,
      coverImagePath: args.input.coverImagePath,
      updatedAt: new Date(),
    })
    .where(and(eq(venues.id, args.venueId), eq(venues.version, args.expectedVersion)))
    .returning();
  if (!updated) {
    throw new OwnerVenueError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }
  return updated;
}

export async function setVenueStatus(args: {
  ownerId: string;
  venueId: string;
  expectedVersion: number;
  action: VenueStatusAction;
}): Promise<Venue> {
  const existing = await loadVenueOwned(args.venueId, args.ownerId);
  if (existing.version !== args.expectedVersion) {
    throw new OwnerVenueError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }

  // Owners can only flip between draft <-> pending_review.
  // Admin promotes to active; owners cannot self-publish.
  let nextStatus: Venue["status"];
  if (args.action === "submit_for_review") {
    if (existing.status === "active" || existing.status === "suspended") {
      throw new OwnerVenueError(
        "forbidden",
        "Cannot resubmit a published or suspended venue. Contact support.",
      );
    }
    nextStatus = "pending_review";
  } else {
    if (existing.status === "active" || existing.status === "suspended") {
      throw new OwnerVenueError(
        "forbidden",
        "Cannot revert a published or suspended venue to draft.",
      );
    }
    nextStatus = "draft";
  }

  const [updated] = await db
    .update(venues)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(and(eq(venues.id, args.venueId), eq(venues.version, args.expectedVersion)))
    .returning();
  if (!updated) {
    throw new OwnerVenueError(
      "version_conflict",
      "This venue was changed in another tab. Reload to see the latest.",
    );
  }
  return updated;
}

// ----------------------------------------------------------------------------
// court create / update / archive
// ----------------------------------------------------------------------------

export async function createCourt(args: {
  ownerId: string;
  venueId: string;
  input: CourtUpsertInput;
}): Promise<Court> {
  await loadVenueOwned(args.venueId, args.ownerId); // ownership guard
  const [created] = await db
    .insert(courts)
    .values({
      venueId: args.venueId,
      name: args.input.name,
      surface: args.input.surface,
      isIndoor: args.input.isIndoor,
      hourlyRateCentavos: phpStringToCentavos(args.input.hourlyRatePhp),
      openHour: args.input.openHour,
      closeHour: args.input.closeHour,
      imagePath: args.input.imagePath,
      isActive: true,
    })
    .returning();
  if (!created) throw new OwnerVenueError("unknown", "Failed to create court.");
  return created;
}

export async function updateCourt(args: {
  ownerId: string;
  courtId: string;
  input: CourtUpsertInput;
}): Promise<Court> {
  const { court } = await getCourtForOwner(args.courtId, args.ownerId);
  const [updated] = await db
    .update(courts)
    .set({
      name: args.input.name,
      surface: args.input.surface,
      isIndoor: args.input.isIndoor,
      hourlyRateCentavos: phpStringToCentavos(args.input.hourlyRatePhp),
      openHour: args.input.openHour,
      closeHour: args.input.closeHour,
      imagePath: args.input.imagePath,
      updatedAt: new Date(),
    })
    .where(eq(courts.id, court.id))
    .returning();
  if (!updated) throw new OwnerVenueError("unknown", "Failed to update court.");
  return updated;
}

export async function setCourtActive(args: {
  ownerId: string;
  courtId: string;
  isActive: boolean;
}): Promise<Court> {
  const { court } = await getCourtForOwner(args.courtId, args.ownerId);

  if (!args.isActive) {
    // Block archiving if there are future bookings that aren't terminal.
    const future = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.courtId, court.id),
          gt(bookings.startAt, new Date()),
          inArray(bookings.status, ["pending_payment", "payment_submitted", "confirmed"]),
        ),
      )
      .limit(1);
    if (future.length > 0) {
      throw new OwnerVenueError(
        "court_has_active_bookings",
        "This court has upcoming bookings. Cancel or wait for them to finish before archiving.",
      );
    }
  }

  const [updated] = await db
    .update(courts)
    .set({ isActive: args.isActive, updatedAt: new Date() })
    .where(eq(courts.id, court.id))
    .returning();
  if (!updated) throw new OwnerVenueError("unknown", "Failed to update court.");
  return updated;
}

// Reference imports kept to satisfy lint when only some are used per build.
void or;
void sql;

// ----------------------------------------------------------------------------
// court closures — create / list / soft-delete (Tier 9)
// ----------------------------------------------------------------------------

export interface CourtClosureInput {
  startAt: Date;
  endAt: Date;
  reason?: string | null;
}

/**
 * Creates a scheduled closure block for a court. The DB EXCLUDE constraint
 * rejects overlapping active closures on the same court automatically.
 *
 * Authorization: caller must own the venue the court belongs to.
 */
export async function addCourtClosure(args: {
  ownerId: string;
  courtId: string;
  input: CourtClosureInput;
}): Promise<CourtClosure> {
  const { court } = await getCourtForOwner(args.courtId, args.ownerId);

  if (args.input.endAt <= args.input.startAt) {
    throw new OwnerVenueError("validation", "End time must be after start time.");
  }

  try {
    const [created] = await db
      .insert(courtClosures)
      .values({
        courtId: court.id,
        createdBy: args.ownerId,
        startAt: args.input.startAt,
        endAt: args.input.endAt,
        ...(args.input.reason ? { reason: args.input.reason } : {}),
      })
      .returning();
    if (!created) throw new OwnerVenueError("unknown", "Failed to create closure.");
    return created;
  } catch (err) {
    // PG EXCLUDE violation (23P01) → overlapping closure already exists
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23P01"
    ) {
      throw new OwnerVenueError(
        "closure_overlap",
        "This time window overlaps an existing closure for this court.",
      );
    }
    throw err;
  }
}

/**
 * Lists active (non-deleted) closures for a court, ordered by start_at asc.
 * Does NOT paginate — courts are expected to have a small number of future
 * closures at any time (< 50). Cap at 200 as a safety net.
 */
export async function listCourtClosures(args: {
  ownerId: string;
  courtId: string;
}): Promise<CourtClosure[]> {
  await getCourtForOwner(args.courtId, args.ownerId); // ownership guard

  return db
    .select()
    .from(courtClosures)
    .where(and(eq(courtClosures.courtId, args.courtId), isNull(courtClosures.deletedAt)))
    .orderBy(asc(courtClosures.startAt))
    .limit(200);
}

/**
 * Soft-deletes a court closure. Idempotent — deleting an already-deleted
 * closure is a no-op (not an error).
 *
 * Authorization: caller must own the venue the court belongs to.
 */
export async function removeCourtClosure(args: {
  ownerId: string;
  closureId: string;
}): Promise<void> {
  // Load the closure to verify ownership.
  const rows = await db
    .select({ closure: courtClosures, venueOwnerId: venues.ownerId })
    .from(courtClosures)
    .innerJoin(courts, eq(courts.id, courtClosures.courtId))
    .innerJoin(venues, eq(venues.id, courts.venueId))
    .where(eq(courtClosures.id, args.closureId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new OwnerVenueError("not_found", "Closure not found.");
  if (row.venueOwnerId !== args.ownerId) {
    throw new OwnerVenueError("forbidden", "You do not have access to this closure.");
  }

  // Soft-delete; already-deleted rows are silently skipped.
  await db
    .update(courtClosures)
    .set({ deletedAt: new Date() })
    .where(and(eq(courtClosures.id, args.closureId), isNull(courtClosures.deletedAt)));
}

// ----------------------------------------------------------------------------
// court hourly rate bands — set / list
// ----------------------------------------------------------------------------

export interface RateBandInput {
  fromHour: number; // 0–23
  toHour: number;   // 1–24, must be > fromHour
  rateCentavos: bigint;
}

/**
 * Replaces ALL rate bands for a court atomically.
 * Passing an empty array clears all bands (revert to single base rate).
 * The DB EXCLUDE constraint rejects overlapping ranges.
 */
export async function saveCourtRateBands(args: {
  ownerId: string;
  courtId: string;
  bands: RateBandInput[];
}): Promise<CourtHourlyRate[]> {
  await getCourtForOwner(args.courtId, args.ownerId); // ownership guard

  return db.transaction(async (tx) => {
    // Delete all existing bands for this court.
    await tx.delete(courtHourlyRates).where(eq(courtHourlyRates.courtId, args.courtId));

    if (args.bands.length === 0) return [];

    try {
      return await tx
        .insert(courtHourlyRates)
        .values(
          args.bands.map((b) => ({
            courtId: args.courtId,
            fromHour: b.fromHour,
            toHour: b.toHour,
            rateCentavos: b.rateCentavos,
          })),
        )
        .returning();
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "23P01"
      ) {
        throw new OwnerVenueError("validation", "Rate bands must not overlap.");
      }
      throw err;
    }
  });
}

export async function listCourtRateBands(args: {
  ownerId: string;
  courtId: string;
}): Promise<CourtHourlyRate[]> {
  await getCourtForOwner(args.courtId, args.ownerId); // ownership guard
  return db
    .select()
    .from(courtHourlyRates)
    .where(eq(courtHourlyRates.courtId, args.courtId))
    .orderBy(courtHourlyRates.fromHour);
}
