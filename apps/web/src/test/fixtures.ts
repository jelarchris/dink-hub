/**
 * Test fixtures: create real rows in the dev DB so service tests run end-to-end.
 * Each fixture uses random UUIDs and inserts into auth.users so FKs work.
 * Cleanup deletes in reverse FK order at the end of each test.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type Fixtures = {
  ownerId: string;
  playerId: string;
  venueId: string;
  courtId: string;
  hourlyRateCentavos: bigint;
  cleanup: () => Promise<void>;
};

const HOURLY_RATE_CENTAVOS = 20000n; // ₱200/hour

/**
 * Snap a Date to the next 1-hour slot at least `minutesFromNow` in the future.
 */
export function nextHour(minutesFromNow = 60): Date {
  const ms = Date.now() + minutesFromNow * 60_000;
  const slotMs = 60 * 60_000;
  return new Date(Math.ceil(ms / slotMs) * slotMs);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

async function insertAuthUser(id: string, email: string): Promise<void> {
  // Minimal auth.users row. Supabase doesn't enforce a password for direct inserts.
  await db.execute(sql`
    insert into auth.users (id, email, instance_id, aud, role)
    values (${id}::uuid, ${email}, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated')
    on conflict do nothing
  `);
}

async function deleteAuthUser(id: string): Promise<void> {
  await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
}

export async function createFixtures(opts?: { hourlyRateCentavos?: bigint }): Promise<Fixtures> {
  const ownerId = randomUUID();
  const playerId = randomUUID();
  const venueId = randomUUID();
  const courtId = randomUUID();
  const slug = `test-venue-${venueId.slice(0, 8)}`;
  const hourly = opts?.hourlyRateCentavos ?? HOURLY_RATE_CENTAVOS;

  await insertAuthUser(ownerId, `owner-${ownerId.slice(0, 8)}@dinkhub.test`);
  await insertAuthUser(playerId, `player-${playerId.slice(0, 8)}@dinkhub.test`);

  // NOTE: an `on_auth_user_created` trigger (migration 0002) inserts a default
  // `profiles` row when we insert into `auth.users` above. Upsert to set the
  // role + display name we actually want for tests.
  await db.execute(sql`
    insert into public.profiles (id, display_name, email, role)
    values
      (${ownerId}::uuid, 'Test Owner', ${`owner-${ownerId.slice(0, 8)}@dinkhub.test`}, 'venue_owner'),
      (${playerId}::uuid, 'Test Player', ${`player-${playerId.slice(0, 8)}@dinkhub.test`}, 'player')
    on conflict (id) do update set
      display_name = excluded.display_name,
      email = excluded.email,
      role = excluded.role,
      deleted_at = null,
      suspended_at = null
  `);

  await db.execute(sql`
    insert into public.venues (id, owner_id, name, slug, address_line, city, status)
    values (${venueId}::uuid, ${ownerId}::uuid, 'Test Venue', ${slug}, '123 Test St', 'Bayugan City', 'active')
  `);

  await db.execute(sql`
    insert into public.courts (id, venue_id, name, hourly_rate_centavos, is_active)
    values (${courtId}::uuid, ${venueId}::uuid, 'Court 1', ${hourly}, true)
  `);

  // Ensure a known, non-zero current system fee. Tests assert against this value.
  // We insert a fresh row with effective_from = now() so it wins the "current" query.
  await db.execute(sql`
    insert into public.system_fee_settings (fee_amount_centavos, effective_from, notes)
    values (2000, now(), 'test fixture')
  `);

  const cleanup = async (): Promise<void> => {
    // Cascade order: ledger -> payments -> bookings -> holds -> courts -> venues -> profiles -> auth
    await db.execute(sql`delete from public.ledger_entries where booking_id in (
      select id from public.bookings where player_id = ${playerId}::uuid
    )`);
    await db.execute(sql`delete from public.payments where booking_id in (
      select id from public.bookings where player_id = ${playerId}::uuid
    )`);
    await db.execute(sql`delete from public.bookings where player_id = ${playerId}::uuid`);
    await db.execute(sql`delete from public.slot_holds where player_id = ${playerId}::uuid`);
    await db.execute(sql`delete from public.courts where id = ${courtId}::uuid`);
    await db.execute(sql`delete from public.venues where id = ${venueId}::uuid`);
    await db.execute(sql`delete from public.profiles where id in (${ownerId}::uuid, ${playerId}::uuid)`);
    await deleteAuthUser(ownerId);
    await deleteAuthUser(playerId);
  };

  return { ownerId, playerId, venueId, courtId, hourlyRateCentavos: hourly, cleanup };
}

/** sha256 hex helper for receipt hash fixtures. */
export function sha256Hex(input: string): string {
  // Lazy import — only used in tests
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
