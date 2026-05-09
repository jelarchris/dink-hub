import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const RECEIPTS_BUCKET = "payment-receipts";

export const ALLOWED_RECEIPT_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

export type ReceiptUploadError =
  | { code: "file_missing"; message: string }
  | { code: "file_too_large"; message: string }
  | { code: "file_type_unsupported"; message: string }
  | { code: "upload_failed"; message: string };

export interface ReceiptUploadResult {
  path: string;
  hashHex: string;
  byteSize: number;
  mimeType: string;
}

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * Validates and uploads a single receipt image to the private receipts bucket.
 * Returns the storage path + content hash for the caller to attach to a Payment row.
 */
export async function uploadReceipt(args: {
  bookingId: string;
  file: File;
}): Promise<{ ok: true; data: ReceiptUploadResult } | { ok: false; error: ReceiptUploadError }> {
  const { bookingId, file } = args;

  if (!file || file.size === 0) {
    return { ok: false, error: { code: "file_missing", message: "Receipt image is required" } };
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", message: "Receipt must be 5 MB or smaller" },
    };
  }
  const mime = file.type.toLowerCase();
  if (!(ALLOWED_RECEIPT_MIME as readonly string[]).includes(mime)) {
    return {
      ok: false,
      error: {
        code: "file_type_unsupported",
        message: "Only JPEG, PNG or WebP images are accepted",
      },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hashHex = createHash("sha256").update(bytes).digest("hex");
  const path = `bookings/${bookingId}/${Date.now()}-${randomUUID()}.${extFor(mime)}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
    cacheControl: "private, max-age=0",
  });
  if (error) {
    return { ok: false, error: { code: "upload_failed", message: error.message } };
  }

  return {
    ok: true,
    data: { path, hashHex, byteSize: bytes.byteLength, mimeType: mime },
  };
}

/**
 * Returns a signed URL for an authorized viewer (venue owner / admin).
 * 5 minute TTL. Authorization MUST be checked by caller before invoking.
 */
export async function getReceiptSignedUrl(path: string, ttlSeconds = 300): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
