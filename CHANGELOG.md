# Changelog

## 2026-05-19

### Fixed — "Application error: a client-side exception has occurred"

- **Symptom:** intermittent generic error page that disappears on refresh. Could appear on any route.
- **Root cause:** classic Next.js stale-chunk issue after a Vercel deploy — the user's already-loaded HTML references JS chunks (by content hash) from the previous build. When the page tries to load a chunk Vercel has already replaced, webpack throws `ChunkLoadError`. With no route-level error boundary in `(app)`, the failure bubbled to `global-error.tsx` which rendered Next's stark default `NextError` message.
- **Fix:**
  - New `apps/web/src/app/(app)/error.tsx` route-level boundary that:
    - Detects `ChunkLoadError` (and the four other names browsers use for it) and triggers exactly one hard reload, gated by a `sessionStorage` flag so it cannot loop if the reload itself fails. User sees a calm "Updating to the latest version…" spinner instead of an error.
    - For real runtime errors, renders a branded recovery card with `Try again` (calls `reset()`) and `Go home` buttons, plus the Sentry digest reference for support correlation.
    - Pipes every non-chunk error to Sentry tagged `boundary: "app-segment"` with the digest in `extra`.
  - Rewrote `apps/web/src/app/global-error.tsx` (root-layout-failure fallback) from the stark `NextError` widget to an inline-styled friendly card with `Try again` / `Go home`. Inline styles because the root layout has failed → no Tailwind tokens / fonts available.
- Files:
  - `apps/web/src/app/(app)/error.tsx` (new)
  - `apps/web/src/app/global-error.tsx` (rewritten)

## 2026-05-18 (later 8)

### Chore ΓÇö Remove Cloudflare Turnstile / CAPTCHA from all flows

- User reported the CAPTCHA widget was throwing "system failure" errors on sign-in / sign-up. Server-side `verifyTurnstileToken` had already been a no-op, and the React widget was no longer rendered anywhere, but the dead imports, env vars, and copy mentions remained ΓÇö and the client-side script load was likely the source of the failure.
- Removed every reference to Turnstile across the codebase:
  - Deleted `apps/web/src/lib/turnstile.ts` and `apps/web/src/components/turnstile-widget.tsx`.
  - Extracted the still-needed `getClientIp` helper (used for per-IP rate-limit identifiers) into a new `apps/web/src/lib/client-ip.ts`.
  - Stripped `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `lib/env.ts` (both schema entries and the `processEnv` map).
  - Dropped the dead verify block + unused `headers` import from `features/owner-invoices/actions.ts`.
  - Simplified `preflightAuthGate` in `features/auth/actions.ts` to a rate-limit-only check (no args, no captcha plumbing).
  - Removed stale captcha comments in `book/[bookingId]/pay/receipt-form.tsx`, `venues/[slug]/book/booking-flow.tsx`, and `features/booking/actions.ts`.
  - Rewrote the `host` FAQ ("verified email + per-user rate limits") and the `privacy` policy IP-address bullet and removed the Cloudflare CAPTCHA processor entry.
  - Removed the `TURNSTILE_SITE_KEY ΓåÆ NEXT_PUBLIC_TURNSTILE_SITE_KEY` rename mapping from `scripts/push-env-to-vercel.ps1`.
- Per-IP / per-user rate limits remain the abuse defence for auth, booking-create, and receipt-upload.
- **Follow-up for the operator:** delete `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from the Vercel project env vars (they're now unused and will fail-fast the env validator if anything references them later).
- Verified: `pnpm --filter web typecheck` Γ£ô, `pnpm --filter web lint` Γ£ô. Commits `557fc53` + `c57304f`.

## 2026-05-18 (later 7)

### Fix ΓÇö Booking slots auto-release the moment the 15-min payment window lapses

- Symmetric fix to the open-play stale-signup bug from earlier today. A booking that the player created but never paid for could keep a court slot marked as "taken" for up to ~60s (until the every-minute cron flipped it to `expired`). For the next player trying to book the same slot, this manifested as either a phantom busy mark in the picker or a `slot_not_available` error on submit.
- **Fix, defence in depth:**
  1. **Query-level (instant UX):** added `AND NOT (status = 'pending_payment' AND payment_due_at <= now())` to all three court-availability queries in `features/venues/repo.ts` ΓÇö `getCourtOccupancy` (single court picker), `getCourtsOccupancy` (batch picker for the booking page), and `getVenueAvailabilityMap` busy CTE (the home/listing availability grid). Display is now correct on every page load.
  2. **Create-time (no phantom EXCLUDE violation):** new `expireOverlappingStalePendingBookings({ courtId, startAt, endAt })` helper in `features/booking/repo.ts` runs inside the same transaction as `insertBooking`, flipping any overlapping `pending_payment` booking on the same court whose 15-min window already lapsed. The `EXCLUDE USING gist` constraint then sees them as `expired` and lets the new booking through. Court-scoped + time-scoped so it never touches unrelated rows.
- Doesn't change the EXCLUDE constraint itself (postgres `WHERE` predicates on partial indexes must be immutable, so `now()` can't be referenced there).
- The every-minute cron (`/api/cron/expire`) still flips stale rows globally as a backstop.
- Files:
  - `apps/web/src/features/venues/repo.ts` (3 SQL queries patched)
  - `apps/web/src/features/booking/repo.ts` (new `expireOverlappingStalePendingBookings`)
  - `apps/web/src/features/booking/service.ts` (call helper inside `createBooking` tx, before `insertBooking`)
- Verified: `pnpm --filter web typecheck` Γ£ô, `pnpm --filter web lint` Γ£ô.

## 2026-05-18 (later 6)

### Fix ΓÇö Open Play "filled slots" no longer count stale unpaid signups

- **Bug:** A player who joined an Open Play session but never uploaded a GCash receipt still counted as a filled slot for up to ~45 minutes (the 15-min payment window + the 30-min reminder cron interval). Other players saw the session as fuller than it really was.
- **Fix, defence in depth:**
  1. **Query-level (instant):** introduced a shared `activeSignupWhere` SQL fragment in `features/open-play/repo.ts` that excludes signups in `pending_payment` past their `payment_due_at`. Applied to all four count queries ΓÇö `listPublishedSessions`, `listSessionsByVenue`, `listSessionsByOwner`, and `countActiveSignups` (used by the public session detail page and the join-capacity check). `activeSignupCount` is now correct on every page load, regardless of cron timing.
  2. **Cron-level (DB consistency):** added `expirePendingSignups` to the every-minute `/api/cron/expire` route (alongside `releaseExpiredHolds` and `expireUnpaidBookings`), so the row actually flips to `expired` within ~60s. The existing every-30-min `open-play-reminder` cron still calls it as a backstop.
- Knock-on benefits:
  - The join-capacity check (`countActiveSignups` in `service.joinSession`) now releases the seat immediately once the previous player's window lapses ΓÇö no need to wait for the cron.
  - Owner dashboards see accurate counts in real time.
- Files:
  - `apps/web/src/features/open-play/repo.ts` (new `activeSignupWhere` fragment + 4 query updates)
  - `apps/web/src/features/open-play/index.ts` (export `expirePendingSignups`)
  - `apps/web/src/app/api/cron/expire/route.ts` (added open-play signup expiration)
- Verified: `pnpm --filter web typecheck` Γ£ô, `pnpm --filter web lint` Γ£ô.

## 2026-05-18 (later 5)

### Feature ΓÇö "Enable location" prompt + distance sort on /venues and /open-play

- Slim inline pill on both `/venues` and `/open-play` invites the user to share their location and re-sorts results by distance. Designed to be small (single line on desktop, wraps on mobile), so it never pushes the grid below the fold.
- Two visual states:
  - **Idle:** rounded-full pill with brand-gradient background, MapPin badge, headline ("See courts/sessions nearest you"), inline Enable button + dismiss `├ù`. Errors (permission denied / timeout / generic) replace the headline in red and the button becomes "Retry".
  - **Active:** compact brand-tinted pill ("Sorted by distance from you") with a Clear link that strips `?lat&lng` from the URL.
- Distance computed with the haversine formula in JS (no PostGIS yet ΓÇö fine at launch-market scale). When `near` is supplied, repos widen the DB fetch to a larger pool (up to 100ΓÇô200 rows), compute distance for every row, sort ascending with nulls last, then slice back to the user-visible limit.
- Per-card distance pill (`850 m` / `2.3 km` / `14 km`) appears next to the city on each result card so the "Sorted by distance" claim is visually concrete.
- URL is the source of truth (`?lat=&lng=`) so the lens is shareable / bookmarkable / preserved across other filter changes (city, sort, query).
- Coordinates cached in `sessionStorage` for 1h so enabling on `/venues` carries over to `/open-play` automatically (no second permission prompt needed within the same browser session).
- Dismissal persisted in `localStorage` per-scope (`dinkhub-location-prompt:venues:dismissed` / `:open-play:dismissed`) so a user who hides the prompt on one surface still sees it on the other.
- Validation: ignores out-of-range lat/lng (lat Γêë [-90,90] or lng Γêë [-180,180]); silently drops malformed URLs rather than 500-ing.
- A11y: respects `prefers-reduced-motion` (no animation added); buttons have accessible labels; `aria-live="polite"` on the error message; geolocation requested with `enableHighAccuracy: false`, 8s timeout, 5-min stale OK.
- Files:
  - `apps/web/src/lib/distance.ts` (new ΓÇö `haversineKm`, `formatDistanceKm`)
  - `apps/web/src/components/location-prompt.tsx` (new client island)
  - `apps/web/src/features/venues/repo.ts` (added `near` option + `distanceKm` field)
  - `apps/web/src/features/open-play/repo.ts` (added `near` option + `distanceKm` field on `SessionListItem`)
  - `apps/web/src/app/(app)/venues/page.tsx` (parse + pass `near`, mount prompt, show distance on cards, preserve `lat/lng` across filter nav)
  - `apps/web/src/app/(app)/open-play/page.tsx` (parse + pass `near`, mount prompt, show distance on cards)
- Verified: `pnpm --filter web typecheck` Γ£ô, `pnpm --filter web lint` Γ£ô.

## 2026-05-18 (later 4)

### Feature ΓÇö Animated launch announcement modal

- New one-time popup announcing that Open Play is live, mounted globally in the `(app)` route group so it surfaces on the home page, venue listings, profile, etc. Suppressed on `/open-play/*`, `/owner/*`, `/admin/*`, and all auth routes (don't interrupt task-focused flows or pages where the announcement would be redundant).
- Pickleball-themed visuals ΓÇö no images, all SVG + CSS:
  - Bouncing yellow pickleball (radial-gradient face, six holes, highlight) with a soft scaling ground shadow for weight.
  - Swinging green paddle (brand colors) behind the ball as a continuous loop.
  - 16-piece confetti burst on open using brand + accent + warning + info tokens, each piece randomized via CSS custom properties (`--cx`, `--cy`, `--cr`).
  - Spring-overshoot entrance (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for the modal, fade for the backdrop.
  - Pulsing red "LIVE" badge in the top-left of the hero.
- Behavior:
  - 1.8s delay after first eligible page load (lets the page settle so it feels like an event, not a blocker).
  - Dismissed-once-per-device via `localStorage["dinkhub-announce:open-play-launch-v1"]`. Key versioned so future announcements re-surface for existing users.
  - Full a11y: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, ESC closes, backdrop click closes, primary CTA auto-focuses, body scroll locked while open, close button has accessible label.
  - Respects `prefers-reduced-motion` ΓÇö already handled globally in `globals.css` (`animation-duration: 0.01ms !important`), so the modal still appears but without the bounce/swing/confetti motion.
  - No new dependencies. Pure CSS keyframes added to `globals.css`.
- Primary CTA links to `/open-play` and dismisses on click. Secondary "Maybe later" simply dismisses.
- Files:
  - `apps/web/src/components/launch-announcement.tsx` (new, ~250 lines client component with inline pickleball + paddle SVG)
  - `apps/web/src/app/(app)/layout.tsx` (mount once at the end of the layout)
  - `apps/web/src/app/globals.css` (7 new keyframes + utility classes under a "Launch announcement modal" section)
- Verified: `pnpm typecheck` Γ£ô, `pnpm lint` Γ£ô.

## 2026-05-18 (later 3)

### Polish ΓÇö Open Play feedback & share UX

- Added `sonner` toast notifications for the four owner/player open-play actions that previously refreshed the page silently: publish session, cancel session, verify payment, reject payment, and cancel signup. Each emits a one-line success toast (top-center, 3.5s, rich colors) so users get explicit confirmation that the server action landed.
- `<Toaster />` mounted once in the root layout ΓÇö single instance covers the whole app.
- Owner session detail share card overhauled: instead of a small inline link, the published-session card now shows the full URL in a monospace code box with a `CopyButton`, plus a full-width "Preview public page" outline button (`buttonVariants`) that opens the listing in a new tab. Pattern matches the GCash-number block on the open-play pay page.
- Session creation form gains a helper hint on the **Start** field ΓÇö "Asia/Manila time ΓÇö what players will see on the listing." ΓÇö to prevent the timezone confusion that bit us when browser-local differs from venue-local.
- Files (modified):
  - `apps/web/src/app/layout.tsx` (mount `<Toaster />`)
  - `apps/web/src/app/(app)/owner/open-play/[sessionId]/owner-actions.tsx` (toasts on 4 actions)
  - `apps/web/src/app/(app)/owner/open-play/[sessionId]/page.tsx` (share card redesign)
  - `apps/web/src/app/(app)/me/open-play/cancel-signup-button.tsx` (toast on cancel)
  - `apps/web/src/app/(app)/owner/venues/[id]/open-play/new/session-form.tsx` (Manila hint)
- Dependencies: added `sonner@2.0.7` to `apps/web` (~5KB, shadcn-recommended toast primitive).

## 2026-05-18 (later 2)

### Removed ΓÇö Launch promo (replaced by vouchers)

- The platform-wide "launch promo" toggle is gone. Vouchers (per-code, optionally venue-scoped) now handle every discount use case, so the promo is dead weight.
- Booking fee always falls through to the admin-configured base fee (snapshotted to each new booking row as before). Existing bookings keep whatever fee they were created with ΓÇö no historical data is rewritten.
- Removed UI: top-strip banner across the app, hero callout on `/host`, booking-page callout, "Promo active" empty state on `/owner/invoices`, "Booking fees waived" tone on the owner balance card, the entire "Launch promo" card on `/admin/settings`, and the "Promo status" summary card.
- Removed code: `components/promo-banner.tsx`, `getPromoState`, `PromoState`, `promoApplied` flag on `BookingFeeRule`, all `promo*` form fields + Zod schema entries.
- Migration `0023_drop_promo.sql`: drops `promo_active`, `promo_headline`, `promo_description`, `promo_until_date`, `promo_show_on_home`, `promo_show_on_booking` from `system_settings`. Apply via Supabase SQL editor.
- Files (new):
  - `apps/web/src/db/migrations/0023_drop_promo.sql`
- Files (deleted):
  - `apps/web/src/components/promo-banner.tsx`
- Files (modified): `db/schema/index.ts`, `features/system-settings/{service,schema,actions,index}.ts`, `features/booking/service.ts`, `features/booking/__tests__/service.test.ts`, `features/owner-invoices/components/owner-balance-card.tsx`, `app/(app)/{layout,host/page,owner/invoices/page,venues/[slug]/book/page,admin/settings/page,admin/settings/settings-form}.tsx`

## 2026-05-18 (later)

### Added ΓÇö Optional venue scoping on vouchers

- Vouchers can now be restricted to a single venue. The new `vouchers.venue_id` column is `NULL` for global codes (work everywhere, default) or set to a specific venue UUID for venue-only codes.
- Validation runs on both preview and inside the booking transaction. If the voucher's `venue_id` is set and doesn't match the booking's venue, the player gets a friendly "This voucher is not valid at this venue" error and the booking fee is unaffected.
- Admin create form gains a "Restrict to venue" dropdown defaulted to "All venues (global)". Active, non-deleted venues only.
- Admin list shows a Venue column ("All venues" for global codes, venue name otherwise). Detail page shows a "Venue scope" row.
- `ON DELETE SET NULL`: deleting a venue silently downgrades the voucher to global instead of breaking redemptions.
- Files (new):
  - `apps/web/src/db/migrations/0022_voucher_venue_scope.sql`
- Files (modified):
  - `apps/web/src/db/schema/index.ts` (`venueId` column)
  - `apps/web/src/features/vouchers/{schema,service,repo,actions,preview-helpers}.ts`
  - `apps/web/src/features/booking/service.ts` (passes `venueId` to both validate calls)
  - `apps/web/src/app/(app)/admin/vouchers/page.tsx` (Venue column)
  - `apps/web/src/app/(app)/admin/vouchers/new/{page,new-voucher-form}.tsx` (venue dropdown)
  - `apps/web/src/app/(app)/admin/vouchers/[id]/page.tsx` (Venue scope row)

## 2026-05-18

### Added ΓÇö Voucher (discount code) system for booking fees

- Admins can create promo codes that discount the system booking fee (either percent off, e.g. `LAUNCH20` = 20% off, or flat Γé▒ off). Codes have optional total-use caps, per-player caps, minimum court fee, and expiry date. Players paste the code on Step 1 of the booking flow, click Apply, see the discounted fee in the summary, then proceed to payment with the discounted amount.
- **Architecture (Option B):** discount is baked into `system_fee_centavos` at booking creation. The generated `total_centavos` column (court_fee + system_fee) is untouched, so historical totals stay consistent. Three audit columns added to `bookings`: `voucher_id`, `voucher_code_snapshot`, `discount_centavos`.
- **Atomic redemption:** `tryIncrementVoucherRedemption` uses an UPDATE with a WHERE clause inside the booking transaction ΓÇö physically impossible to exceed `max_redemptions`.
- **Per-user cap** enforced by counting existing redemptions for `(voucher_id, user_id)` inside the booking tx.
- **Discount never exceeds base system fee** ΓÇö capped server-side in `validateVoucherForBooking`.
- **RLS:** authenticated users can read only active vouchers; redemptions readable only by the redeeming user or admins.
- **Audit:** every voucher create + status change writes to `admin_audit_log`.
- Files (new):
  - `apps/web/src/db/migrations/0021_vouchers.sql` (enums, tables, RLS, bookings columns)
  - `apps/web/src/features/vouchers/{schema,repo,service,errors,actions,preview-helpers,index}.ts`
  - `apps/web/src/app/(app)/admin/vouchers/page.tsx` (list)
  - `apps/web/src/app/(app)/admin/vouchers/new/{page,new-voucher-form}.tsx`
  - `apps/web/src/app/(app)/admin/vouchers/[id]/{page,status-form}.tsx`
- Files (modified):
  - `apps/web/src/db/schema/{enums,index}.ts` (2 new enums, 2 new tables, 3 bookings columns)
  - `apps/web/src/features/booking/schema.ts` (`voucherCode` optional input)
  - `apps/web/src/features/booking/service.ts` (validate + snapshot + apply inside tx)
  - `apps/web/src/features/booking/actions.ts` (forward `voucherCode`, handle `VoucherError`)
  - `apps/web/src/app/(app)/admin/layout.tsx` (sidebar link with Tag icon)
  - `apps/web/src/app/(app)/venues/[slug]/book/booking-flow.tsx` (voucher input + preview UI in Step 1, discount row in summary, forwards code into `proceedToPayment`)

## 2026-05-17 (evening, later 3)

### Fixed ΓÇö booking page showed stale system fee (Γé▒20 instead of admin-set Γé▒15)

- **Root cause:** the system has two fee tables ΓÇö a legacy `system_fee_settings` history table and a newer `system_settings` singleton. Admin's settings form writes to the singleton, but `findCurrentSystemFeeCentavos` (which the public booking page calls to display the fee estimate) was still reading from the legacy table. Booking creation already read from the correct singleton, so bookings were *charging* Γé▒15 while the page *displayed* Γé▒20 ΓÇö a trust-breaking mismatch.
- **Fix:** `findCurrentSystemFeeCentavos` now delegates to `getCurrentBookingFeeRule()` (the single source of truth). Legacy table only used as fallback if the singleton row is missing (test fixtures / un-migrated envs).
- Files:
  - `apps/web/src/features/booking/repo.ts`

## 2026-05-17 (evening, later 2)

### Admin (system) dashboard ΓÇö audit + polish

- Audited `/admin/*` end-to-end: all 15 routes load real DB data, all 14 server actions guarded by `requireAdmin()`, audit logging on every mutation, double-entry ledger intact, optimistic concurrency throughout, query scoping correct (admin sees everything; not filtered by owner_id).
- **Added** loading.tsx for all 5 admin detail pages (venues, users, bookings, payouts, invoices) ΓÇö previously users saw a blank screen during the multi-join DB queries.
- **Fixed** invoice receipt image eager-loads on the admin invoice detail page (was `lazy`, felt slow on a page where the receipt IS the primary content).
- Files:
  - `apps/web/src/app/(app)/admin/venues/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/users/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/bookings/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/payouts/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/page.tsx`

## 2026-05-17 (evening, later)

### Owner dashboard ΓÇö audit + polish

- Ran end-to-end audit of `/owner/*` pages: all routes load real DB data, all forms wired to real server actions, RLS/authorization checks confirmed throughout, optimistic concurrency intact.
- **Added** prominent warning Alert on payment review card when receipt amount doesn't match expected total ΓÇö previously the mismatch was only a tiny red text easy to miss when verifying GCash payments.
- **Added** loading state for `/owner/venues/[id]/courts/new` route (was missing ΓÇö users saw blank while form loaded).
- Files:
  - `apps/web/src/app/(app)/owner/payments/review-card.tsx`
  - `apps/web/src/app/(app)/owner/venues/[id]/courts/loading.tsx` (new)

## 2026-05-17 (evening)

### Removed ΓÇö CAPTCHA disabled across all forms

- **Why:** Private launch with ~100 invited users ΓÇö bot signup/spam is not a realistic threat at this scale. The CAPTCHA was causing real users on mobile / distant networks to get stuck on "Security check failed".
- **Server:** `verifyTurnstileToken` now hard-returns `{ success: true, skipped: true }` regardless of environment. Original logic preserved below the early return so re-enabling is a one-line revert later.
- **Client:** `<TurnstileWidget>` removed from sign-up, sign-in, forgot-password, and invoice-receipt forms.
- Files:
  - `apps/web/src/lib/turnstile.ts`
  - `apps/web/src/app/(auth)/sign-up/page.tsx`
  - `apps/web/src/app/(auth)/sign-in/page.tsx`
  - `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - `apps/web/src/app/(app)/owner/invoices/[id]/pay-form.tsx`

## 2026-05-17 (later)

### Fixed ΓÇö Turnstile failing on mobile / distant networks

- **Issue:** Users on Android browsers from regions far from their usual location (e.g. ~200km away) were seeing "Security check failed ΓÇö please retry" with no visible CAPTCHA to solve.
- **Root cause:** The Turnstile widget was rendered with `appearance: "interaction-only"`, which keeps the iframe invisible. When Cloudflare's risk engine flags a session (mobile carriers, unfamiliar geos, older Android WebViews) it requires the user to complete an interactive challenge ΓÇö but with the widget hidden, there was nothing to click, so no token was ever produced.
- **Fix:** Changed appearance to `"always"`. Low-risk sessions still complete silently (brief "VerifyingΓÇª" spinner), and flagged sessions now get a visible challenge they can actually solve.
- File: `apps/web/src/components/turnstile-widget.tsx`

### Fixed ΓÇö Sign-up email verification link

- Added explicit `emailRedirectTo` on `supabase.auth.signUp` so the confirmation link in the verification email points to our `NEXT_PUBLIC_APP_URL/sign-in` instead of relying on Supabase's dashboard "Site URL" fallback.
- File: `apps/web/src/features/auth/service.ts`
- **Action required in Supabase dashboard** (see notes below) to enable confirmation emails.

## 2026-05-17

### Added ΓÇö Booking detail page redesign (`/me/bookings/[id]`)

- **Hero card** with venue cover photo, gradient overlay, prominent status badge, and venue identity (avatar + name + address)
- **4-step progress bar** (Submitted ΓåÆ Under Review ΓåÆ Confirmed ΓåÆ Completed) derived from booking status and end time
- **Redesigned Booking Summary** card with prominent date, court schedule with indoor/outdoor badge, time range, duration, and itemized total (court fee, system fee, total paid)
- **Action buttons** (2├ù2 grid):
  - **Add to Calendar** ΓÇö generates `.ics` file client-side and triggers download
  - **Get Directions** ΓÇö opens Google Maps directions (uses venue coords when set, falls back to address search)
  - **Contact Venue** ΓÇö `tel:` link to venue owner's phone (graceful "No phone listed" state when missing)
  - **View Receipt** ΓÇö opens signed receipt URL in a new tab
- Owner phone now fetched via a small `profiles.phoneE164` lookup keyed on `venue.ownerId`

### Files

- `apps/web/src/app/(app)/me/bookings/[id]/page.tsx` ΓÇö full visual redesign; all existing functionality (status alerts, payment receipt card, review form, cancel button, "Pay now" CTA) preserved
- `apps/web/src/app/(app)/me/bookings/_components/booking-action-buttons.tsx` ΓÇö new client component (RFC 5545 ICS builder + 4 action tiles)

## 2026-05-16

### Fixed ΓÇö Payment submission flow

- Silent failure when no receipt file was attached ΓåÆ now returns `"file_required"` with a clear inline error
- Missing error display on rejection responses ΓåÆ errors now surface to the player
- Double-submit causing `"booking is payment_submitted"` error ΓåÆ added `disabled` state via shared `SubmitButton` (driven by `useFormStatus`) and a `pendingLabel` spinner during upload
- Slow submit perceived as a hang ΓåÆ email/SMS notifications deferred via Next's `after()` so the response returns before sending. Applied to `submit`, `verify`, and `reject` actions.

### Build/deploy

- Fixed stray `}` in `apps/web/src/app/(app)/venues/[slug]/book/booking-flow.tsx` Alert import that broke the Vercel build
- Vercel: disabled "Require Log In" deployment protection; git author email aligned with GitHub account

## 2026-05-14

### Fixed — alt-tab freeze (mobile menu scroll-lock leak)

- **Bug:** After switching to another app/tab and returning to dinkhub.ph, the page looked normal but nothing was clickable. Refresh was the only fix.
- **Root cause:** Opening the mobile menu sets document.body.style.position = "fixed" to lock scroll behind the drawer. If the user alt-tabbed away while the menu was open (or React's effect cleanup got interrupted by Fast Refresh / navigation / React 19 concurrent mode), the cleanup that restores position could be skipped — leaving the body locked and the whole page apparently frozen.
- **Fix:** Added a isibilitychange listener in Navbar that force-clears all body scroll-lock styles whenever the page becomes visible AND the mobile menu is not currently open. Zero-cost safety net.
- Files:
  - `apps/web/src/components/navbar.tsx` (new effect alongside existing unmount guard)
- Commit `b19b182`.
