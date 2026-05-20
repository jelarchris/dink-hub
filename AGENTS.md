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
| Receipt SLA UX ("we'll review within 1h" + nudge owner if stale) | Player sits in limbo |
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
- Open Play sessions can occupy multiple courts via `open_play_session_courts (session_id, court_id, shadow_booking_id NULL)`. `open_play_sessions.court_id` and `shadow_booking_id` stay populated with the FIRST selected court as `primary` for back-compat — do NOT drop NOT NULL. `publishSession` is one transaction inserting one shadow booking per court; any EXCLUDE conflict (23P01) rolls back the whole publish. `cancelSession` walks the join table and cancels every shadow. Booking picker (`/venues/[slug]/book`) renders open-play windows as wide gradient tiles (`gridColumn: span N`) with shimmer animation gated by `@media (prefers-reduced-motion: no-preference)`; subsequent hours skipped via a consumed-hours `Set` inside an IIFE wrapping `slots.map`.

## Update protocol

After every merged slice:
1. Add an entry to top of `CHANGELOG.md` (date, commit SHA, scope, summary).
2. If a NEW invariant or hard-won fact emerges, add it to the relevant section of this file.
3. Commit both in the same PR as the change.

**Stale `CHANGELOG.md` = duplicate AI recommendations = wasted work.**
