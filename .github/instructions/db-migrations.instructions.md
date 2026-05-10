---
applyTo: "apps/web/src/db/migrations/**"
---

# DinkHub — DB migration rules

Migrations are forward-only. Never edit a committed file; write a new one with the next number.

## Required in every migration touching user data
- Enable RLS in the same file. Default deny.
- SELECT-only policies for owners/admins on financial tables. Writes go through service-role server actions — do **not** grant INSERT/UPDATE policies on `bookings`, `payments`, `ledger_entries`, `owner_invoices`, `venue_payouts`, `system_settings`.
- `created_at timestamptz not null default now()`. Use `timestamptz`, never `timestamp`.
- For mutable rows: `updated_at` + `version int` + the existing `bump_version` trigger.

## Money + invariants
- All money is `bigint` (centavos PHP). Never `numeric`/`float` for arithmetic.
- Check constraints for non-negative amounts.
- Use generated columns for derived totals: `bigint generated always as (a + b) stored`.
- Idempotency: UNIQUE on the natural idempotency key (e.g. `(venue_id, period_start)` for invoices, `(booking_id, receipt_hash)` for payments).
- Booking overlap: `EXCLUDE USING gist (court_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status NOT IN ('cancelled','no_show','expired'))`.

## Indexes
- Index every FK and every column used in WHERE clauses on hot paths (`(venue_id, status)`, `(status, due_date)`, `(period_start)`).

## Apply
```powershell
cd apps/web; pnpm migrate-run src/db/migrations/XXXX_name.sql
```
The runner loads `.env.local` (via `DIRECT_URL`/`DATABASE_URL`). One Supabase project only: `uffuyavfpvoendvpvypy`.

## After applying
- Mirror the schema in `apps/web/src/db/schema/index.ts` (and enums in `enums.ts`). Add `$inferSelect`/`$inferInsert` types.
- Generated columns in Drizzle: `.generatedAlwaysAs(sql\`...\`)`. Do not pass them on insert.
