# Changelog

## 2026-05-18 (later)

### Added — Optional venue scoping on vouchers

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

### Added — Voucher (discount code) system for booking fees

- Admins can create promo codes that discount the system booking fee (either percent off, e.g. `LAUNCH20` = 20% off, or flat ₱ off). Codes have optional total-use caps, per-player caps, minimum court fee, and expiry date. Players paste the code on Step 1 of the booking flow, click Apply, see the discounted fee in the summary, then proceed to payment with the discounted amount.
- **Architecture (Option B):** discount is baked into `system_fee_centavos` at booking creation. The generated `total_centavos` column (court_fee + system_fee) is untouched, so historical totals stay consistent. Three audit columns added to `bookings`: `voucher_id`, `voucher_code_snapshot`, `discount_centavos`.
- **Atomic redemption:** `tryIncrementVoucherRedemption` uses an UPDATE with a WHERE clause inside the booking transaction — physically impossible to exceed `max_redemptions`.
- **Per-user cap** enforced by counting existing redemptions for `(voucher_id, user_id)` inside the booking tx.
- **Discount never exceeds base system fee** — capped server-side in `validateVoucherForBooking`.
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

### Fixed — booking page showed stale system fee (₱20 instead of admin-set ₱15)

- **Root cause:** the system has two fee tables — a legacy `system_fee_settings` history table and a newer `system_settings` singleton. Admin's settings form writes to the singleton, but `findCurrentSystemFeeCentavos` (which the public booking page calls to display the fee estimate) was still reading from the legacy table. Booking creation already read from the correct singleton, so bookings were *charging* ₱15 while the page *displayed* ₱20 — a trust-breaking mismatch.
- **Fix:** `findCurrentSystemFeeCentavos` now delegates to `getCurrentBookingFeeRule()` (the single source of truth). Legacy table only used as fallback if the singleton row is missing (test fixtures / un-migrated envs).
- Files:
  - `apps/web/src/features/booking/repo.ts`

## 2026-05-17 (evening, later 2)

### Admin (system) dashboard — audit + polish

- Audited `/admin/*` end-to-end: all 15 routes load real DB data, all 14 server actions guarded by `requireAdmin()`, audit logging on every mutation, double-entry ledger intact, optimistic concurrency throughout, query scoping correct (admin sees everything; not filtered by owner_id).
- **Added** loading.tsx for all 5 admin detail pages (venues, users, bookings, payouts, invoices) — previously users saw a blank screen during the multi-join DB queries.
- **Fixed** invoice receipt image eager-loads on the admin invoice detail page (was `lazy`, felt slow on a page where the receipt IS the primary content).
- Files:
  - `apps/web/src/app/(app)/admin/venues/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/users/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/bookings/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/payouts/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/page.tsx`

## 2026-05-17 (evening, later)

### Owner dashboard — audit + polish

- Ran end-to-end audit of `/owner/*` pages: all routes load real DB data, all forms wired to real server actions, RLS/authorization checks confirmed throughout, optimistic concurrency intact.
- **Added** prominent warning Alert on payment review card when receipt amount doesn't match expected total — previously the mismatch was only a tiny red text easy to miss when verifying GCash payments.
- **Added** loading state for `/owner/venues/[id]/courts/new` route (was missing — users saw blank while form loaded).
- Files:
  - `apps/web/src/app/(app)/owner/payments/review-card.tsx`
  - `apps/web/src/app/(app)/owner/venues/[id]/courts/loading.tsx` (new)

## 2026-05-17 (evening)

### Removed — CAPTCHA disabled across all forms

- **Why:** Private launch with ~100 invited users — bot signup/spam is not a realistic threat at this scale. The CAPTCHA was causing real users on mobile / distant networks to get stuck on "Security check failed".
- **Server:** `verifyTurnstileToken` now hard-returns `{ success: true, skipped: true }` regardless of environment. Original logic preserved below the early return so re-enabling is a one-line revert later.
- **Client:** `<TurnstileWidget>` removed from sign-up, sign-in, forgot-password, and invoice-receipt forms.
- Files:
  - `apps/web/src/lib/turnstile.ts`
  - `apps/web/src/app/(auth)/sign-up/page.tsx`
  - `apps/web/src/app/(auth)/sign-in/page.tsx`
  - `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - `apps/web/src/app/(app)/owner/invoices/[id]/pay-form.tsx`

## 2026-05-17 (later)

### Fixed — Turnstile failing on mobile / distant networks

- **Issue:** Users on Android browsers from regions far from their usual location (e.g. ~200km away) were seeing "Security check failed — please retry" with no visible CAPTCHA to solve.
- **Root cause:** The Turnstile widget was rendered with `appearance: "interaction-only"`, which keeps the iframe invisible. When Cloudflare's risk engine flags a session (mobile carriers, unfamiliar geos, older Android WebViews) it requires the user to complete an interactive challenge — but with the widget hidden, there was nothing to click, so no token was ever produced.
- **Fix:** Changed appearance to `"always"`. Low-risk sessions still complete silently (brief "Verifying…" spinner), and flagged sessions now get a visible challenge they can actually solve.
- File: `apps/web/src/components/turnstile-widget.tsx`

### Fixed — Sign-up email verification link

- Added explicit `emailRedirectTo` on `supabase.auth.signUp` so the confirmation link in the verification email points to our `NEXT_PUBLIC_APP_URL/sign-in` instead of relying on Supabase's dashboard "Site URL" fallback.
- File: `apps/web/src/features/auth/service.ts`
- **Action required in Supabase dashboard** (see notes below) to enable confirmation emails.

## 2026-05-17

### Added — Booking detail page redesign (`/me/bookings/[id]`)

- **Hero card** with venue cover photo, gradient overlay, prominent status badge, and venue identity (avatar + name + address)
- **4-step progress bar** (Submitted → Under Review → Confirmed → Completed) derived from booking status and end time
- **Redesigned Booking Summary** card with prominent date, court schedule with indoor/outdoor badge, time range, duration, and itemized total (court fee, system fee, total paid)
- **Action buttons** (2×2 grid):
  - **Add to Calendar** — generates `.ics` file client-side and triggers download
  - **Get Directions** — opens Google Maps directions (uses venue coords when set, falls back to address search)
  - **Contact Venue** — `tel:` link to venue owner's phone (graceful "No phone listed" state when missing)
  - **View Receipt** — opens signed receipt URL in a new tab
- Owner phone now fetched via a small `profiles.phoneE164` lookup keyed on `venue.ownerId`

### Files

- `apps/web/src/app/(app)/me/bookings/[id]/page.tsx` — full visual redesign; all existing functionality (status alerts, payment receipt card, review form, cancel button, "Pay now" CTA) preserved
- `apps/web/src/app/(app)/me/bookings/_components/booking-action-buttons.tsx` — new client component (RFC 5545 ICS builder + 4 action tiles)

## 2026-05-16

### Fixed — Payment submission flow

- Silent failure when no receipt file was attached → now returns `"file_required"` with a clear inline error
- Missing error display on rejection responses → errors now surface to the player
- Double-submit causing `"booking is payment_submitted"` error → added `disabled` state via shared `SubmitButton` (driven by `useFormStatus`) and a `pendingLabel` spinner during upload
- Slow submit perceived as a hang → email/SMS notifications deferred via Next's `after()` so the response returns before sending. Applied to `submit`, `verify`, and `reject` actions.

### Build/deploy

- Fixed stray `}` in `apps/web/src/app/(app)/venues/[slug]/book/booking-flow.tsx` Alert import that broke the Vercel build
- Vercel: disabled "Require Log In" deployment protection; git author email aligned with GitHub account
