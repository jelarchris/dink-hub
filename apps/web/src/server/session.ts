import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";
import { getCurrentUser } from "@/features/auth/service";

/**
 * Loads the current user + profile in a single de-duplicated call per request.
 * `cache()` ensures multiple Server Components in the same render share one query.
 */
export const getSessionUser = cache(async (): Promise<Profile | null> => {
  const auth = await getCurrentUser();
  if (!auth) return null;
  const rows = await db.select().from(profiles).where(eq(profiles.id, auth.id)).limit(1);
  return rows[0] ?? null;
});
