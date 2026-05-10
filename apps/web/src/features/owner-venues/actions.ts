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

// ----------------------------------------------------------------------------
// venue actions
// ----------------------------------------------------------------------------

export async function createVenueAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const guard = await ensureOwner();
  if (!guard.ok) return guard.result;

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
