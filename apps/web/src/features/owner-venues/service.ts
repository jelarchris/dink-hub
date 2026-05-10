import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bookings,
  courts,
  venues,
  type Court,
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
}

export async function listVenuesForOwner(ownerId: string): Promise<OwnerVenueListItem[]> {
  const rows = await db
    .select({
      venue: venues,
      courtCount: sql<number>`count(${courts.id}) filter (where ${courts.deletedAt} is null)::int`,
    })
    .from(venues)
    .leftJoin(courts, eq(courts.venueId, venues.id))
    .where(and(eq(venues.ownerId, ownerId), isNull(venues.deletedAt)))
    .groupBy(venues.id)
    .orderBy(desc(venues.createdAt));
  return rows.map((r) => ({ venue: r.venue, courtCount: r.courtCount }));
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
      coverImageUrl: args.input.coverImageUrl,
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
      coverImageUrl: args.input.coverImageUrl,
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
