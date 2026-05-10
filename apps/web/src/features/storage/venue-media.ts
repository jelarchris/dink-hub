import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { VENUE_MEDIA_BUCKET, venueMediaPublicUrl } from "@/lib/venue-media";

export { VENUE_MEDIA_BUCKET, venueMediaPublicUrl };

export const ALLOWED_VENUE_MEDIA_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_VENUE_MEDIA_BYTES = 5 * 1024 * 1024; // 5 MB

export type VenueMediaUploadError =
  | { code: "file_too_large"; message: string }
  | { code: "file_type_unsupported"; message: string }
  | { code: "upload_failed"; message: string };

export interface VenueMediaUploadResult {
  /** Storage path inside the venue-media bucket. */
  path: string;
  /** Stable public URL (bucket is public-read). */
  publicUrl: string;
}

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * Validate + upload a venue or court image to the public `venue-media` bucket.
 * Caller is responsible for authorising the action (owner/admin) before invoking.
 *
 * `kind` only affects the storage path prefix so files are easy to inspect /
 * GC later. Returns both path and public URL — store the path in the DB and use
 * the URL for rendering.
 */
export async function uploadVenueMedia(args: {
  kind: "venue-cover" | "court" | "gcash-qr" | "system-qr";
  file: File;
}): Promise<
  { ok: true; data: VenueMediaUploadResult } | { ok: false; error: VenueMediaUploadError }
> {
  const { kind, file } = args;

  if (file.size > MAX_VENUE_MEDIA_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", message: "Image must be 5 MB or smaller" },
    };
  }
  const mime = file.type.toLowerCase();
  if (!(ALLOWED_VENUE_MEDIA_MIME as readonly string[]).includes(mime)) {
    return {
      ok: false,
      error: {
        code: "file_type_unsupported",
        message: "Only JPEG, PNG or WebP images are accepted",
      },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Random UUID per upload — stable URL, no collision, easy to revoke later.
  const path = `${kind}/${randomUUID()}.${extFor(mime)}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(VENUE_MEDIA_BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });
  if (error) {
    return { ok: false, error: { code: "upload_failed", message: error.message } };
  }

  const { data } = supabase.storage.from(VENUE_MEDIA_BUCKET).getPublicUrl(path);
  return { ok: true, data: { path, publicUrl: data.publicUrl } };
}

/**
 * Best-effort deletion. Never throws.
 */
export async function deleteVenueMedia(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const supabase = createServiceClient();
  await supabase.storage.from(VENUE_MEDIA_BUCKET).remove([path]).catch(() => {});
}
