# AGENTS.md — read this first

> This file is the **portable session memory** for DinkHub. Any AI agent (Copilot, Claude, Cursor) on any machine should read it before suggesting code or features. It replaces local-only Copilot memory which does NOT sync across laptops.

---

## Project at a glance

- **What:** Pickleball court booking marketplace for the Philippines.
- **Live:** https://dinkhub.ph
- **Repo root:** monorepo, app at `apps/web/` (Next.js 15 App Router, React 19, TypeScript strict)
- **Stack:** Tailwind v4 + shadcn/ui, Supabase Postgres 15 + RLS, Drizzle ORM, Zod, Resend, Sentry, PostHog, Cloudflare Turnstile, Upstash Redis rate limits.
- **Hosting:** Vercel. Single Supabase project: `uffuyavfpvoendvpvypy` (labelled "dink-hub-dev" but powers prod).
- **Package manager:** pnpm workspaces.

## Required reading before ANY recommendation

1. **`CHANGELOG.md`** at repo root — what shipped. Do NOT re-propose anything listed there.
2. **`.github/copilot-instructions.md`** — architectural rules (RLS-everywhere, money in `bigint` centavos, Manila tz, no `any`, no `useEffect` for data fetching, etc.).
3. **`.github/instructions/*.instructions.md`** — scoped rules (auto-applied via `applyTo` globs but worth scanning).

## Critical invariants (NEVER violate)

- **Money:** `bigint` centavos (PHP). Never `float`/`number`. Use `formatPHP()` from `@/lib/money`.
- **Time:** `timestamptz` UTC in DB. Display in `Asia/Manila` via `Intl.DateTimeFormat({ timeZone: "Asia/Manila" })`. No DST in PH.
- **RLS:** every table. Default deny. Same migration as table creation.
- **Service role key:** server-only. Never in `'use client'` files.
- **Booking double-booking prevention:** PostgreSQL `EXCLUDE USING gist` constraint on `bookings(court_id, tstzrange(start_at, end_at))`. App-level checks are defense-in-depth only.
- **Slot granularity:** 1 hour, on the hour. Bookings are 60/120/180/240 min only. Enforced by DB CHECK constraints (`booking_1_hour_grain`, `ops_1_hour_grain`) added in `0026_one_hour_slots.sql`. No 30-min, no 45-min, no 90-min. Update validators in both `features/booking/schema.ts` and `features/open-play/schema.ts` if changing.
- **Migrations:** forward-only. Never edit a committed migration; write a new one.
- **SMS:** rejected by user (2026-05-13). Email-only via Resend. Do NOT propose Semaphore/Twilio/PhilSMS.
- **`"use server"` files:** can ONLY export async functions. No `export type`, no `export const`, no type re-exports. Violations surface as opaque 500s in prod.
- **Client components:** import server actions DIRECTLY from `@/features/<f>/actions`, NEVER from feature `index.ts` barrel (Webpack: `Can't resolve 'tls'`).
- **Badge variants:** `success | warning | info | danger | neutral`. No `brand`, no `open`, no `submitted`.

## Marketing copy rules (locked)

- Zero fee/commission/charge language on `/` and `/host`.
- Player-facing: "Pay only what you see — no surprises, no hidden charges."
- Owner-facing: "Free to list" is the hook; pricing details ONLY inside checkout, invoices, admin/ledger, owner dashboard.
- Geography: platform-agnostic ("near you", "Philippines"). No Agusan del Sur references anywhere on marketing pages.

## Validation pipeline (before every commit)

```powershell
cd apps/web; pnpm exec tsc --noEmit
cd apps/web; pnpm exec eslint . --max-warnings 0
cd apps/web; pnpm exec next build
```

Husky pre-commit runs `eslint --fix` + typecheck. The `dinkhub-validation` skill encapsulates this.

## Deploy

```powershell
git add -A; git commit -m "..."; git push origin main
vercel --prod --yes
```

Vercel auto-aliases `dinkhub.ph`.

## QA accounts

- Owner: `qa+owner-20260513-ca95d5@dinkhub.ph` / `DhTest-VmlqUi_Bpi169a`
- QA booking URL: https://dinkhub.ph/venues/qa-dinkhub-court-20260513-ca95d5/book

## Vercel env vars (confirmed correct as of 2026-05-14)

- `NEXT_PUBLIC_APP_URL=https://dinkhub.ph`
- `NEXT_PUBLIC_APP_ENV=production`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAADMm5cmBKxtkNfck`
- `TURNSTILE_SECRET_KEY` (set)
- All Supabase, Sentry, Resend, PostHog, Upstash, Resend keys set.

## What's NOT shipped yet (real next-slice candidates)

| Gap | Why it matters |
|---|---|
| Rate bands (per-court hourly pricing) | Migration + Drizzle + venue editor + slot picker + booking fee calc |
| Booking confirmation email polish + ICS attachment | Today it's text-y |
| Session reminder email (T-2h) | Big no-show reduction lever. Email-only |
| PostHog dashboard verification | Wired commit `dbdd14a` but firing not confirmed |
| Player-initiated refund flow | Owner-initiated exists; player has no path |
| Payout dry-run preview in `/admin/payouts` | Reduce risk before "Mark paid" |
| SEO JSON-LD (`LocalBusiness`, `Event`) per venue | Free organic traffic |
| Listing wizard (multi-step new-venue form) | Owners drop off on dense form today |
| Bulk schedule editor for owners | Owner pain point as venues grow |
| Availability filter Slice B | Court-count badges + custom time slider |
| Open Play match-making | Differentiator. 2-3 sessions |
| Tournament management | Bigger venture. 3+ sessions |
| Auth pages UX polish | Low priority |

## Hard-won facts (don't relearn these)

- **Silent-account guest checkout (migration `0032`):** Per-venue opt-in via `venues.allow_guest_checkout` (default ON). `profiles.signup_method` enum (`password|guest_magic_link`) tags accounts so onboarding/owner UIs can branch later. **All guest resolution lives at the ACTION layer** (`features/booking/actions.ts → resolvePlayerForBooking`), NEVER inside `service.ts` — services stay `playerId`-based so every existing feature (no-show, refunds, ledger, RLS, `/me/bookings`) keeps working unchanged. `features/auth/guest.ts` owns `resolveOrCreateGuestPlayer` (idempotent on email via `admin.auth.admin.createUser({ email_confirm: true })` + `db.insert(profiles).onConflictDoNothing({ target: profiles.id })`, race-safe re-read) and `generateMagicSignInLink` (returns `null` on failure — never block a saved booking on a flaky magic-link). Rate limit on the guest path is **IP-keyed** (`guestBookingCreate` 5/10m), NOT user-keyed (no user yet). `email_confirm: true` is acceptable verification because magic-link delivery itself proves inbox ownership before the player can manage the booking. Booking-flow client uses an **email-confirm field with `onPaste` prevention** for guest typo guard. Owner venue editor uses the **hidden-then-checkbox pattern** for boolean toggles: `<input type="hidden" name="x" value="false">` + `<input type="checkbox" name="x" value="true">` so `Object.fromEntries(form)` always sees the checkbox state (FormData.get returns last value for duplicate keys).

- **Open Play receipt parity (migration `0031`, Phase B — shipped 2026-05-25):** Heuristic auto-validation, SLA auto-confirm cron, owner nudges (T-2h / T-30m), and admin late-confirm are all wired for open-play signups now. `features/booking/auto-validation.ts` is feature-generic — reused from open-play UI and service code, NEVER duplicated. The 5 rule codes (`ref_format`, `ref_duplicate`, `hash_replay`, `window_late`, `window_early`) are pushed as string literals (the export is a tuple `as const`, not an object). Idempotency prefix scheme is locked in across both features: `ops:` (owner verify), `auto:` (system cron), `late:` (admin recovery) — keys `${prefix}:${signup_or_booking.id}:${account}`. Service entry points: `autoConfirmEligibleSignups`, `sendOwnerSignupVerificationNudges`, `lateConfirmSignupPayment`. Cron route extended at `/api/cron/expire`. Late-confirm admin Server Action is `lateConfirmSignupPaymentAction` — MUST call `requireAdmin()` itself (defense in depth). Both player and owner are notified on auto-confirm and late-confirm (state change, not marketing). Anti-spam invariant carries over: stamp `owner_nudge{N}_sent_at` BEFORE `sendEmail` — a missed nudge < spam loop. Admin page at `/admin/open-play/late-confirm` reads via new `listLateConfirmSignupCandidates(limit)` in `features/open-play/repo.ts`.

- **Open Play ledger parity (migration `0031`, Phase A):** `confirmSignupAndWriteLedger(tx, signup, payment, now, actor, options?)` in `features/open-play/service.ts` writes 3 ledger entries keyed on `signup.id` via the new `ledger_entries.open_play_signup_id` FK. Idempotency prefix defaults to `ops:` (Phase B will add `auto:` and `late:`). `ledger_entries` CHECK is **at-least-one of** `(booking_id, open_play_signup_id, payout_id, owner_invoice_id)` — strict XOR would break `markPayoutPaid` settlement rows (payout_id only) and owner-invoice settlements (owner_invoice_id only). `generatePayout` runs a parallel aggregation against confirmed `open_play_signups ⋈ open_play_sessions` filtered by `session.startAt ∈ [periodStart, periodEnd)`, then SUMs into combined gross/fees/count; `bookingCount` is the combined total. `aggregateBookingFeesForPeriod` merges per-venue results through an in-memory `Map`; `getCarryoverForVenue` adds a third parallel query for prior-period confirmed signups before subtracting `billed`. Migration 0031 also pre-adds the Phase B-shape columns (`open_play_signups.auto_confirm_at`, 9 audit columns on `open_play_signup_payments`, partial indexes) so Phase B doesn't need another migration — they're inert until lit up.

- **Receipt auto-validation (migration `0030`):** 5 heuristic rules (`ref_format`, `ref_duplicate`, `hash_replay`, `window_late`, `window_early`) run inside `submitPayment`'s transaction. Codes persist to `payments.auto_validation_failures text[]`; `auto_validated_at` is stamped only when the array is empty. "Semi-confirmed" is **derived UI state**, NOT a new `booking_status` enum value (`auto_validated_at IS NOT NULL AND status='payment_submitted' AND failures='{}'`). `bookings.auto_confirm_at = startAt - 30min` is scheduled only when checks pass AND there's > 10 min slack. Cron job `autoConfirmEligibleBookings` (per-minute) does the actual confirm. Shared helper `confirmBookingAndWriteLedger(tx, booking, payment, now, actor, options)` is the ONLY place ledger entries are written for confirmation — owner/system/admin paths funnel through it. Idempotency-key prefix encodes provenance: `bk:` (owner) / `auto:` (system cron) / `late:` (admin). Stamp `owner_nudge{N}_sent_at` BEFORE Resend send so a thrown email doesn't re-spam on retry. Failure-code → UI metadata lives in `features/booking/auto-validation.ts` — single source of truth for player/owner/admin surfaces. Player never sees failure codes (avoids tipping off bad actors). Admin late-confirm Server Action MUST call `requireAdmin()` itself; admin layout protects the page UI but actions can be hit from anywhere.

- **Deposit / full payment (migration `0029`):** per-venue opt-in via `venues.allow_partial_payment` + `venues.deposit_percent` (25–75). Booking carries `payment_mode ('full'|'deposit')`, `deposit_centavos`, `balance_due_centavos` (generated invariant: deposit+balance=total), `balance_collected_at`/`_by`. `bookings.total_centavos` is GENERATED — CHECK constraints CAN still reference it. Deposit rounds **UP to peso favoring the venue**: `((((total*pct+99n)/100n)+99n)/100n)*100n` (mirrored client+server, MUST stay in sync). BookingErrorCodes added: `deposit_not_allowed`, `deposit_not_configured`. Balance is collected at the venue in cash OR GCash — DinkHub does **not** track the channel; owner taps `MarkBalanceCollectedForm` to record it. Partial index `bookings_balance_outstanding_idx` powers fast owner-side "who owes me cash on arrival" queries. For Zod schemas with `.default()`ed fields that feed service input types, use `z.input<typeof schema>` (not `z.infer`) so existing tests can omit defaulted fields.

- Closure auto-move (`closeBookingsForRange` with `autoReschedule:true`) iterates sibling courts inside a nested `tx.transaction(async sp => ...)` SAVEPOINT — `23P01` continues to next sibling, `23505` (`bookings_one_active_rebook_per_parent`) breaks the loop entirely. Auto-moved child gets `cancellableUntil = now+24h` (not 15min) so player has time to react after waking up. `bookingRescheduledByOwnerEmail` switches to "Court change" wording when `oldCourtName` is set AND old/new times are equal — used by `notifyBookingAutoMoved`. Parent is always cancelled; child appears confirmed at same time on new court.
- Closure flow writes BOTH `bookings` force-cancellations AND `court_closures` rows in one tx — closure rows are intentional historical evidence, do not GC.
- Booking page `?rebook=<bookingId>` enters free-rebook mode: same venue, same duration, parent fees snapshot, status=`confirmed`, no payment. DB partial unique idx `bookings_one_active_rebook_per_parent` is the authoritative double-claim guard. Free-rebook categories: `venue_closure | weather | court_unavailable`.
- BookingError code for EXCLUDE GiST constraint hit is `slot_not_available` (NOT `slot_unavailable`); 23505 → `booking_wrong_status`.
- Drizzle self-FK requires `AnyPgColumn`: `uuid("rebook_of_id").references((): AnyPgColumn => bookings.id, { onDelete: "set null" })`.

- React 19 `react-hooks/purity` lint forbids `Date.now()` inside Server Component render functions (even though it'd run on the server). Compute `now` in the page handler and pass it in as a prop.
- `getOwnerGridData(args)` (`features/bookings-view/repo.ts`) takes `courtId` as OPTIONAL and falls back to the first active court internally. Don't do two-pass lookups from the page — pass the requested court id with the `exactOptionalPropertyTypes` spread `...(id !== undefined ? { courtId: id } : {})` and let the repo resolve. Returns `null` only when the venue isn't owned.
- User-entered place names (`venues.city`, `venues.province`) arrive in mixed casing (e.g. "Cabadbaran City" vs "CABADBARAN CITY"). Group by `lower(city)` server-side and normalise display via `toTitleCase` from `@/lib/casing`. `listActiveVenueCities` already does this; `listActiveVenues` filters with `lower(city) = lower(x)`.

- ONE Supabase project only. No separate prod DB.
- Vercel Hobby caps cron to once/day → use GitHub Actions for sub-daily AND weekly crons. `CRON_SECRET` repo secret = Vercel `CRON_SECRET` env.
- Asia/Manila is fixed UTC+8, no DST → `+ 8h` arithmetic is safe in `computePriorWeekPeriod`.
- Drizzle generated columns: `bigint("total_centavos", { mode: "bigint" }).notNull().generatedAlwaysAs(sql\`fees_centavos + carryover_centavos\`)` — do NOT pass it on insert.
- `onConflictDoNothing` returns empty array on conflict → re-SELECT to fetch existing row.
- Booking status enum: only `confirmed` owes a fee. `pending_payment`/`payment_submitted`/`cancelled`/`expired`/`refunded` do NOT.
- `bookings.systemFeeCentavos` is the snapshot. Aggregate by `start_at` falling in period (not `created_at`).
- `owner_invoices` has NO direct INSERT/UPDATE RLS policy — all writes via service-role server actions/cron. Intentional.
- Unique constraint `owner_invoices_unique_receipt UNIQUE (id, receipt_hash)` is the idempotency key for receipt re-uploads.
- No `@/lib/logger` module — use `console.info` or `captureException` from `@/lib/observability`.
- `lucide-react` has NO `Facebook` icon — use inline SVG path.
- Header has `backdrop-blur` → creates containing block for `position: fixed` descendants. Mobile drawer MUST be portaled to `<body>`.
- Receipt upload: rate-limited 5/min/user. Turnstile was REMOVED 2026-05-14 — do not re-add without user request.
- Mobile menu locks body scroll via `position: fixed`. The `Navbar` has a `visibilitychange` listener that force-clears stale locks on tab return (alt-tab freeze fix, commit `b19b182`).
- `next/og` (Satori): every multi-child container needs `display: "flex"`; no `gap` (use margin); no grid; no CSS custom properties (inline brand hex colors). `runtime = "nodejs"` is required when the route uses `qrcode` or `Buffer`.
- `next/og` (Satori) — **woff2 is unsupported** (`Unsupported OpenType signature wOF2`). Always feed TTF/OTF. Pattern: hit `https://fonts.googleapis.com/css?family=Inter:700` with `User-Agent: Wget/1.20.3 (linux-gnu)` to get `src: url(...ttf)`; any browser-like UA returns `/l/font?kit=` blobs that aren't usable fonts. Wrap font fetch in `Promise.allSettled` so CDN flakes degrade to system font instead of 500.
- `next/og` (Satori) — absolute children: use explicit `top/left/right/bottom: 0` + `width:"100%",height:"100%"` instead of `inset: 0` (Satori zero-sizes parents whose only children are absolute). Use `backgroundImage: "linear-gradient(...)"` separate from `backgroundColor`, not the `background` shorthand. Avoid remote raster images (Supabase signed URLs, WebP, CORS all bite) — prefer CSS gradients.
- Inter (Google Fonts v20) has **no ₱ glyph (U+20B1)** — renders as tofu in Satori. Replace `\u20B1` with `"PHP "` in any OG/share-card rendering context. Do not touch `formatPHP` in `@/lib/money`.
- `next/og` (Satori) — **`flexWrap: "wrap"` is unreliable** for variable-width children inside nested flex containers (chips overflow the right edge even with explicit `width`, `flexShrink: 0`, and no wrapper divs). Chunk into rows manually: `chunk(items, perRow)` → column of flex rows, last-child margin trimmed. Likewise **`whiteSpace: nowrap` + `textOverflow: ellipsis` does not actually clip** — prefer text wrapping with explicit `lineHeight`.
- `exactOptionalPropertyTypes: true` forbids `{ key: maybeUndefined }`. Use spread: `...(value ? { key: value } : {})`.
- Owner availability poster lives at `/api/og/availability/[slug]` + composer at `/owner/venues/[id]/share`. Public image (booking-page data is already public). FB sharing uses the web Sharer dialog (`https://www.facebook.com/sharer/sharer.php?u=...`) — do NOT add Pages API / OAuth without explicit ask (Meta App Review burden).
- Social-media carousel slides live at `/api/og/social/[slide]` (slide ids `1`–`10`: hero, loop, book, flow, open-play, vs-messenger, owners, auto-move, trust, closer). `?format=square|portrait|fb`. Brand palette inlined as bg `#062018`, accent `#34D399`, card `#0E2A22`, body `#9AB3A8`. Public route. All currency rendered as `PHP ` (Inter ₱ glyph missing in Satori). Owner-side pill bakes the current launch offer ("0% platform fee for first 2 months") — update copy here when the promo ends.
- Open Play sessions can occupy multiple courts via `open_play_session_courts (session_id, court_id, shadow_booking_id NULL)`. `open_play_sessions.court_id` and `shadow_booking_id` stay populated with the FIRST selected court as `primary` for back-compat — do NOT drop NOT NULL. `publishSession` is one transaction inserting one shadow booking per court; any EXCLUDE conflict (23P01) rolls back the whole publish. `cancelSession` walks the join table and cancels every shadow. Booking picker (`/venues/[slug]/book`) renders open-play windows as wide gradient tiles (`gridColumn: span N`) with shimmer animation gated by `@media (prefers-reduced-motion: no-preference)`; subsequent hours skipped via a consumed-hours `Set` inside an IIFE wrapping `slots.map`.

## Update protocol

After every merged slice:
1. Add an entry to top of `CHANGELOG.md` (date, commit SHA, scope, summary).
2. If a NEW invariant or hard-won fact emerges, add it to the relevant section of this file.
3. Commit both in the same PR as the change.

**Stale `CHANGELOG.md` = duplicate AI recommendations = wasted work.**
