/**
 * E2E seed/cleanup helpers.
 *
 * Inserts auth.users (with bcrypt password + confirmed email so signInWithPassword
 * works) + profiles + one venue + one court + a known system fee.
 * Idempotent: stable email + slug, deletes old rows before re-inserting.
 *
 * Authenticated specs sign in via POST /api/test/signin (gated by E2E_TEST_TOKEN
 * and NODE_ENV !== "production"). The route does a normal signInWithPassword
 * with the password defined here, so no Admin API or service-role JWT is needed.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const webRoot = process.cwd();
loadEnv({ path: path.resolve(webRoot, ".env.local") });
loadEnv({ path: path.resolve(webRoot, ".env.test.local"), override: false });

/** Single shared password for every E2E persona. Never used outside test env. */
export const E2E_PASSWORD = "e2e-test-Pw_2026";

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

  // Insert/refresh the auth row with a bcrypt password (via pgcrypto.crypt) and
  // a confirmed email so signInWithPassword succeeds without a confirmation step.
  // `instance_id` is the GoTrue default '00000000-...'.
  await sql`
    insert into auth.users (
      id, instance_id, aud, role,
      email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change_token_new, email_change,
      created_at, updated_at
    )
    values (
      ${id}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated',
      ${email},
      extensions.crypt(${E2E_PASSWORD}, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', '',
      now(), now()
    )
    on conflict (id) do update set
      email                  = excluded.email,
      encrypted_password     = excluded.encrypted_password,
      email_confirmed_at     = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
      confirmation_token     = '',
      recovery_token         = '',
      email_change_token_new = '',
      email_change           = '',
      updated_at             = now()
  `;

  // GoTrue's signInWithPassword expects an `auth.identities` row for the email
  // provider; without it the post-auth schema query returns null and the SDK
  // surfaces a misleading "Database error querying schema" 500.
  const identityData = {
    sub: id,
    email,
    email_verified: true,
    phone_verified: false,
    provider: "email",
  };
  await sql`
    insert into auth.identities (provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at)
    values ('email', ${id}, ${id}::uuid, ${sql.json(identityData)}, now(), now(), now())
    on conflict (provider, provider_id) do update set
      identity_data = excluded.identity_data,
      updated_at    = now()
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

export interface SeededOwnerInvoice {
  id: string;
  venueId: string;
  ownerId: string;
  version: number;
}

export interface CreateSubmittedOwnerInvoiceOptions {
  label: string;
  periodOffsetWeeks: number;
  bookingCount?: number;
  feesCentavos?: number;
  carryoverCentavos?: number;
}

const DAY_MS = 86_400_000;

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
  await sql`delete from public.ledger_entries where owner_invoice_id in (
    select oi.id from public.owner_invoices oi
    inner join public.venues v on v.id = oi.venue_id
    where v.owner_id = ${ownerId}::uuid
  )`;
  await sql`delete from public.owner_invoices where venue_id in (
    select id from public.venues where owner_id = ${ownerId}::uuid
  )`;
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

export async function createSubmittedOwnerInvoice(
  opts: CreateSubmittedOwnerInvoiceOptions,
): Promise<SeededOwnerInvoice> {
  const sql = pg();
  try {
    const worldRows = (await sql`
      select
        v.id::text as venue_id,
        v.owner_id::text as owner_id
      from public.venues v
      where v.slug = ${E2E.venue.slug}
      limit 1
    `) as Array<{ venue_id: string; owner_id: string }>;
    const world = worldRows[0];
    if (!world) throw new Error("[e2e seed] seeded venue not found");

    const periodStart = new Date(
      Date.parse("2026-01-05T00:00:00+08:00") + opts.periodOffsetWeeks * 7 * DAY_MS,
    );
    const periodEnd = new Date(periodStart.getTime() + 7 * DAY_MS);
    const feesCentavos = opts.feesCentavos ?? 4_000;
    const carryoverCentavos = opts.carryoverCentavos ?? 0;
    const bookingCount = opts.bookingCount ?? 2;

    const rows = (await sql`
      insert into public.owner_invoices (
        venue_id,
        period_start,
        period_end,
        booking_count,
        fees_centavos,
        carryover_centavos,
        due_date,
        status,
        receipt_hash,
        gcash_reference_number,
        amount_paid_centavos,
        submitted_at,
        submitted_by
      )
      values (
        ${world.venue_id}::uuid,
        ${periodStart},
        ${periodEnd},
        ${bookingCount},
        ${feesCentavos},
        ${carryoverCentavos},
        ((${periodEnd}::timestamptz at time zone 'Asia/Manila')::date + 7),
        'submitted'::public.owner_invoice_status,
        ${`e2e-${opts.label}-${randomUUID()}`},
        ${`E2E-${opts.label.toUpperCase()}`},
        ${feesCentavos + carryoverCentavos},
        now(),
        ${world.owner_id}::uuid
      )
      returning id::text as id, venue_id::text as venue_id, version
    `) as Array<{ id: string; venue_id: string; version: number }>;
    const invoice = rows[0];
    if (!invoice) throw new Error("[e2e seed] failed to insert owner invoice");

    return {
      id: invoice.id,
      venueId: invoice.venue_id,
      ownerId: world.owner_id,
      version: invoice.version,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function teardownWorld(): Promise<void> {
  const sql = pg();
  try {
    const rows = (await sql`
      select id::text as id from auth.users
      where email in (${E2E.admin.email}, ${E2E.owner.email}, ${E2E.player.email})
    `) as Array<{ id: string }>;

    for (const u of rows) {
      await sql`delete from public.audit_log where actor_id = ${u.id}::uuid`;
      await sql`delete from public.audit_log where target_id in (
        select oi.id from public.owner_invoices oi
        inner join public.venues v on v.id = oi.venue_id
        where v.owner_id = ${u.id}::uuid
      )`;
      await sql`delete from public.audit_log where target_id in (
        select id from public.venues where owner_id = ${u.id}::uuid
      )`;
      await sql`delete from public.audit_log where target_id in (
        select id from public.bookings where player_id = ${u.id}::uuid
      )`;
    }

    for (const u of rows) {
      await sql`delete from public.ledger_entries where owner_invoice_id in (
        select oi.id from public.owner_invoices oi
        inner join public.venues v on v.id = oi.venue_id
        where v.owner_id = ${u.id}::uuid
      )`;
      await sql`delete from public.owner_invoices where venue_id in (
        select id from public.venues where owner_id = ${u.id}::uuid
      )`;
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
    }

    for (const u of rows) {
      await sql`delete from public.profiles where id = ${u.id}::uuid`;
      await sql`delete from auth.identities where user_id = ${u.id}::uuid`;
      await sql`delete from auth.users where id = ${u.id}::uuid`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
