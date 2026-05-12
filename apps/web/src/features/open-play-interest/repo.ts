import "server-only";
import { db } from "@/db/client";
import { openPlayInterest, type NewOpenPlayInterest } from "@/db/schema";

/**
 * Insert an interest signup. Idempotent at the DB level via the
 * UNIQUE (email, market) constraint. Returns true if a new row was inserted,
 * false if the email already existed for this market.
 */
export async function insertInterest(row: NewOpenPlayInterest): Promise<boolean> {
  const inserted = await db
    .insert(openPlayInterest)
    .values(row)
    .onConflictDoNothing({ target: [openPlayInterest.email, openPlayInterest.market] })
    .returning({ id: openPlayInterest.id });
  return inserted.length > 0;
}
