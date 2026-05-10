/**
 * E2E seed/cleanup helpers — anonymous-flow scope.
 *
 * Inserts auth.users + profiles + one venue + one court + a known system fee.
 * Idempotent: stable email + slug, deletes old rows before re-inserting.
 *
 * Auth-required specs are deferred to Phase 2.10b — see ./README.md for the
 * unlock path (legacy JWT service-role key OR a test-only signin route).
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const webRoot = process.cwd();
loadEnv({ path: path.resolve(webRoot, ".env.local") });
loadEnv({ path: path.resolve(webRoot, ".env.test.local"), override: false });

export const E2E = {
  admin: { email: "e2e-admin@dinkhub.test", displayName: "E2E Admin" },
  owner: { email: "e2e-owner@dinkhub.test", displayName: "E2E Owner" },
  player: { email: "e2e-player@dinkhub.test", displayName: "E2E Player" },
  venue: {
    slug: "e2e-bayugan-courts",
    name: "E2E Bayugan Courts",
  },
  court: {
    name: "Court 1",
    hourlyRateCentavos: 20000, // ₱200/hr
  },
} as const;

function pg(): postgres.Sql {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("[e2e seed] missing DATABASE_URL / DIRECT_URL");
  return postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
}

async function ensureUser(
  sql: postgres.Sql,
  email: string,
  displayName: string,
  role: "player" | "venue_owner" | "admin",
): Promise<string> {
  const existing = (await sql`
    select id::text as id from auth.users where email = ${email} limit 1
  `) as Array<{ id: string }>;
  const id = existing[0]?.id ?? randomUUID();

  await sql`
    insert into auth.users (id, email, instance_id, aud, role)
    values (
      ${id}::uuid, ${email},
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated'
    )
    on conflict (id) do nothing
  `;

  // The on_auth_user_created trigger inserts a default profile; upsert role.
  await sql`
    insert into public.profiles (id, display_name, email, role)
    values (${id}::uuid, ${displayName}, ${email}, ${role}::user_role)
    on conflict (id) do update set
      display_name = excluded.display_name,
      email        = excluded.email,
      role         = excluded.role,
      deleted_at   = null,
      suspended_at = null
  `;
  return id;
}

export interface SeededWorld {
  adminId: string;
  ownerId: string;
  playerId: string;
  venueId: string;
  courtId: string;
}

export async function seedWorld(): Promise<SeededWorld> {
  const sql = pg();
  try {
    const adminId = await ensureUser(sql, E2E.admin.email, E2E.admin.displayName, "admin");
    const ownerId = await ensureUser(sql, E2E.owner.email, E2E.owner.displayName, "venue_owner");
    const playerId = await ensureUser(sql, E2E.player.email, E2E.player.displayName, "player");

    await wipeDomainData(sql, ownerId, playerId);

    const venueRows = (await sql`
      insert into public.venues (
        owner_id, name, slug, address_line, city, status,
        gcash_account_name, gcash_account_number
      )
      values (
        ${ownerId}::uuid,
        ${E2E.venue.name},
        ${E2E.venue.slug},
        '123 Test Street',
        'Bayugan City',
        'active',
        'E2E Owner',
        '09171234567'
      )
      returning id::text as id
    `) as Array<{ id: string }>;
    const venue = venueRows[0];
    if (!venue) throw new Error("[e2e seed] failed to insert venue");

    const courtRows = (await sql`
      insert into public.courts (venue_id, name, hourly_rate_centavos, is_active)
      values (${venue.id}::uuid, ${E2E.court.name}, ${E2E.court.hourlyRateCentavos}, true)
      returning id::text as id
    `) as Array<{ id: string }>;
    const court = courtRows[0];
    if (!court) throw new Error("[e2e seed] failed to insert court");

    await sql`
      insert into public.system_fee_settings (fee_amount_centavos, effective_from, notes)
      values (2000, now(), 'e2e seed')
    `;

    return {
      adminId,
      ownerId,
      playerId,
      venueId: venue.id,
      courtId: court.id,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function wipeDomainData(
  sql: postgres.Sql,
  ownerId: string,
  playerId: string,
): Promise<void> {
  await sql`delete from public.ledger_entries where booking_id in (
    select id from public.bookings where player_id = ${playerId}::uuid
  )`;
  await sql`delete from public.payments where booking_id in (
    select id from public.bookings where player_id = ${playerId}::uuid
  )`;
  await sql`delete from public.bookings where player_id = ${playerId}::uuid`;
  await sql`delete from public.slot_holds where player_id = ${playerId}::uuid`;
  await sql`delete from public.courts where venue_id in (
    select id from public.venues where owner_id = ${ownerId}::uuid
  )`;
  await sql`delete from public.venues where owner_id = ${ownerId}::uuid`;
}

export async function teardownWorld(): Promise<void> {
  const sql = pg();
  try {
    const rows = (await sql`
      select id::text as id from auth.users
      where email in (${E2E.admin.email}, ${E2E.owner.email}, ${E2E.player.email})
    `) as Array<{ id: string }>;
    for (const u of rows) {
      await sql`delete from public.ledger_entries where booking_id in (
        select id from public.bookings where player_id = ${u.id}::uuid
      )`;
      await sql`delete from public.payments where booking_id in (
        select id from public.bookings where player_id = ${u.id}::uuid
      )`;
      await sql`delete from public.bookings where player_id = ${u.id}::uuid`;
      await sql`delete from public.slot_holds where player_id = ${u.id}::uuid`;
      await sql`delete from public.courts where venue_id in (
        select id from public.venues where owner_id = ${u.id}::uuid
      )`;
      await sql`delete from public.venues where owner_id = ${u.id}::uuid`;
      await sql`delete from public.profiles where id = ${u.id}::uuid`;
      await sql`delete from auth.users where id = ${u.id}::uuid`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
