# DinkHub — Copilot Project Instructions

> Pickleball court booking marketplace for the Philippines (launch market: Agusan del Sur).
> Manual GCash payments. Single transfer to venue, system fee deducted from weekly payout.

---

## Stack (locked)

- **Framework:** Next.js 15 (App Router, RSC by default), TypeScript strict, React 19
- **Styling:** Tailwind CSS v4, shadcn/ui (Radix primitives), `cva` for variants
- **DB / Auth / Storage / Realtime:** Supabase (Postgres 15, RLS on every table)
- **ORM:** Drizzle (schema-first, migrations in `apps/web/src/db/migrations/`)
- **Validation:** Zod at every boundary (HTTP, forms, env, webhooks, DB adapters)
- **Forms:** React Hook Form + Zod resolver
- **State:** Server Components first; TanStack Query only for client-side mutations needing optimistic UI
- **Email:** Resend
- **SMS:** Semaphore PH (or PhilSMS fallback)
- **Observability:** Sentry (errors), PostHog (product analytics), structured JSON logs (`pino`)
- **CAPTCHA:** Cloudflare Turnstile on signup, login, booking-create, receipt-upload
- **Rate limiting:** Upstash Redis sliding window
- **Hosting:** Vercel (web) + Supabase (DB)
- **Package manager:** pnpm (workspaces enabled)

---

## Architectural rules (non-negotiable)

### Layering
- **`src/app/`** — Routes only. No business logic. Thin handlers that call services.
- **`src/features/<feature>/`** — Feature-scoped modules. Each has `service.ts` (business), `repo.ts` (DB), `schema.ts` (Zod), `types.ts`, `components/` (UI). No cross-feature imports except via public `index.ts`.
- **`src/db/`** — Drizzle schema + migrations only. Never imported from UI directly.
- **`src/lib/`** — Framework-agnostic utilities (date, currency, formatters). Pure, testable.
- **`src/components/ui/`** — shadcn primitives. No business logic.

### Type safety
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- **Forbid `any`.** Use `unknown` + Zod parse at boundaries.
- All env vars validated via `src/lib/env.ts` (Zod schema, fail fast on boot).
- All API responses typed via Zod-inferred types — single source of truth.

### Security (OWASP-aware)
- **RLS on every table. Default deny.** No table is created without an RLS policy in the same migration.
- **Authorization at the business-action level**, not just routes. Every service function re-checks permissions.
- **Never trust the client.** Re-validate `userId`, `venueId`, `bookingId` ownership server-side on every mutation.
- **Service role key:** server-only, never imported in `'use client'` files. Lint rule enforced.
- **Idempotency keys** on payment receipt uploads, booking creation, payout processing.
- **PII at rest:** GCash receipt images stored in private Supabase Storage bucket with signed URLs (5-min TTL).
- **Input validation:** Zod at HTTP boundary AND DB boundary (defense in depth).
- **CSRF:** Next.js Server Actions are CSRF-safe by default; for route handlers use double-submit cookie pattern.
- **Rate limit** all auth, booking-create, and receipt-upload endpoints (per-IP + per-user).
- **CAPTCHA** on signup, login, booking-create.
- **Logs never contain:** passwords, OTP codes, full GCash reference numbers, JWT tokens. Use `redactedKeys` in pino.

### Database invariants (DB-enforced, not app-only)
- **Booking double-booking prevention:**
  ```sql
  ALTER TABLE bookings ADD CONSTRAINT no_overlap
    EXCLUDE USING gist (
      court_id WITH =,
      tstzrange(start_at, end_at) WITH &&
    ) WHERE (status NOT IN ('cancelled','no_show','expired'));
  ```
- **Ledger integrity:** double-entry. Every `ledger_entries` insert wrapped in transaction; sum of debits = sum of credits per booking.
- **Money:** stored as `bigint` cents (PHP centavos). Never `float`. Never `numeric` for arithmetic.
- **Timestamps:** always `timestamptz`. Application timezone: `Asia/Manila` (display only).
- **Soft delete:** use `deleted_at timestamptz NULL` + RLS policy `WHERE deleted_at IS NULL`. Never `DELETE` user-generated content.
- **Optimistic concurrency:** `version int` column on bookings, payments, payouts. UPDATE WHERE version = $expected.

### Concurrency
- All booking creation in a serializable transaction OR uses `EXCLUDE` constraint (preferred — physically impossible to double-book).
- Slot holds: row in `slot_holds` table with `expires_at`. Edge cron every 60s releases expired holds.
- Payment confirmation: idempotent via `(booking_id, receipt_hash)` unique constraint.

### Performance
- Server Components by default. `'use client'` only when interactivity needed.
- All list endpoints paginated (cursor-based, `limit` capped at 50).
- Indexes required on every FK + every WHERE clause used in queries.
- Image optimization: `next/image` always. Supabase Storage transformations for thumbnails.
- Bundle budget: `/` route < 150KB gzipped JS. Fail CI if exceeded.

### Testing
- **Vitest** for unit + integration. **Playwright** for critical user journeys (booking flow, payment, cancellation).
- Required test coverage on: `service.ts` files (business logic), Zod schemas, RLS policies (via SQL test).
- No mocking the DB in service tests — use Supabase local + truncate between tests.

---

## Domain rules (locked decisions)

1. **Slot granularity:** 30 minutes. Default booking duration: 60 minutes. Min: 30 min, Max: 4 hours.
2. **Slot hold:** 15 min on slot picker, 15 min on payment screen. Auto-release via cron.
3. **Cancellation window:** 15 min from booking creation. After that, button disabled + server rejects (`cancellable_until = created_at + interval '15 minutes'`).
4. **Payment flow:** Single GCash transfer to venue. Player uploads ONE receipt. Venue verifies in dashboard. System fee accrued to platform via ledger entry, deducted from venue's weekly payout.
5. **System fee:** Stored in `system_fee_settings` table, admin-editable. **Snapshot to booking row at creation** (`system_fee_php_snapshot` column) so historical bookings keep their fee even after admin changes the rate.
6. **Currency:** PHP only. Display as `₱1,234.50` (locale `en-PH`). Stored as `bigint` centavos.
7. **Launch market:** Agusan del Sur. Default map center: Bayugan City (`8.7140, 125.7639`).

---

## Code style

- ESLint flat config + `@typescript-eslint/strict-type-checked` + `eslint-plugin-security`
- Prettier with project config (no Prettier disagreements with ESLint)
- File naming: `kebab-case.ts` for files, `PascalCase` for React components
- React components: function declarations, not arrow functions, for top-level exports
- Imports: absolute via `@/` alias (path aliases set in `tsconfig.json`)
- Comments: explain **why**, never **what**. Skip JSDoc on self-evident code.

## Commit / PR

- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `perf:`)
- Every PR runs CI: typecheck, lint, unit tests, build, bundle size check
- DB migrations are **forward-only**. Never edit a committed migration; write a new one.
- ADR required for: new dependency, schema change touching `bookings`/`payments`/`ledger`, auth/RLS changes, new external service.

## Things I should NEVER do

- Disable RLS to "make a query work" — write a SECURITY DEFINER function instead
- Use `service_role` key in any code path callable from the client
- Add a dependency without checking bundle size + maintenance status + license
- Skip Zod validation "because the form already validates"
- Use `float` / `number` for money
- Use `Date.now()` for booking time math — use `timestamptz` from DB
- Catch errors silently — always log with context and re-throw or return typed error
- Return raw DB rows from API — always pass through a response Zod schema
- Add `useEffect` for data fetching in App Router — use Server Components or Server Actions
- Generate URLs unless they're for app routes (no fake docs/blog links)
