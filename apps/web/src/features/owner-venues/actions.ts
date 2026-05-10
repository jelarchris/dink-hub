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
import { deleteVenueMedia, uploadVenueMedia } from "@/features/storage/venue-media";

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

/**
 * Resolve the storage path for an image field carried in a FormData submission:
 *
 *   - If a non-empty File was picked → upload, return its new path (and best-
 *     effort delete the previous one).
 *   - Else if the user clicked Remove → return null (and delete the previous).
 *   - Else → keep the existing path unchanged.
 *
 * Mutates the form by deleting the file/flag fields so downstream
 * `Object.fromEntries(form)` parsing sees a clean record.
 */
async function resolveImagePath(args: {
  form: FormData;
  fileField: string;
  existingField: string;
  removeField: string;
  kind: "venue-cover" | "court" | "gcash-qr";
}): Promise<{ ok: true; path: string | null } | { ok: false; result: ActionResult<never> }> {
  const { form, fileField, existingField, removeField, kind } = args;
  const fileEntry = form.get(fileField);
  const existing = (form.get(existingField) ?? "").toString() || null;
  const removed = (form.get(removeField) ?? "").toString() === "1";

  // Strip from FormData so the schema parse never sees these.
  form.delete(fileField);
  form.delete(existingField);
  form.delete(removeField);

  if (fileEntry instanceof File && fileEntry.size > 0) {
    const result = await uploadVenueMedia({ kind, file: fileEntry });
    if (!result.ok) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "validation",
          message: result.error.message,
          fieldErrors: { [fileField]: [result.error.message] },
        },
      };
    }
    if (existing) await deleteVenueMedia(existing);
    return { ok: true, path: result.data.path };
  }

  if (removed) {
    if (existing) await deleteVenueMedia(existing);
    return { ok: true, path: null };
  }

  return { ok: true, path: existing };
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

  const img = await resolveImagePath({
    form,
    fileField: "coverImageFile",
    existingField: "coverImagePath",
    removeField: "coverImageFile__remove",
    kind: "venue-cover",
  });
  if (!img.ok) return img.result;
  if (img.path) form.set("coverImagePath", img.path);

  const qr = await resolveImagePath({
    form,
    fileField: "gcashQrImageFile",
    existingField: "gcashQrImagePath",
    removeField: "gcashQrImageFile__remove",
    kind: "gcash-qr",
  });
  if (!qr.ok) return qr.result;
  if (qr.path) form.set("gcashQrImagePath", qr.path);

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

  const img = await resolveImagePath({
    form,
    fileField: "coverImageFile",
    existingField: "coverImagePath",
    removeField: "coverImageFile__remove",
    kind: "venue-cover",
  });
  if (!img.ok) return img.result;
  // Always set the resolved path (may be null) so the schema sees the final value.
  form.set("coverImagePath", img.path ?? "");

  const qr = await resolveImagePath({
    form,
    fileField: "gcashQrImageFile",
    existingField: "gcashQrImagePath",
    removeField: "gcashQrImageFile__remove",
    kind: "gcash-qr",
  });
  if (!qr.ok) return qr.result;
  form.set("gcashQrImagePath", qr.path ?? "");

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

  const img = await resolveImagePath({
    form,
    fileField: "imageFile",
    existingField: "imagePath",
    removeField: "imageFile__remove",
    kind: "court",
  });
  if (!img.ok) return img.result;
  if (img.path) form.set("imagePath", img.path);

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

  const img = await resolveImagePath({
    form,
    fileField: "imageFile",
    existingField: "imagePath",
    removeField: "imageFile__remove",
    kind: "court",
  });
  if (!img.ok) return img.result;
  form.set("imagePath", img.path ?? "");

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
