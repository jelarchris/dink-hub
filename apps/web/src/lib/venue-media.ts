import { env } from "@/lib/env";

export const VENUE_MEDIA_BUCKET = "venue-media";

/**
 * Build the public CDN URL for a stored venue-media path. Pure string math —
 * safe in both client and server components. Returns `null` for null/empty.
 */
export function venueMediaPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${VENUE_MEDIA_BUCKET}/${path}`;
}
