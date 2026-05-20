# Changelog

## 2026-05-20 — Social carousel OG route (`/api/og/social/[slide]`)

### Feat — 10-slide FB/IG marketing carousel as server-rendered PNGs

- **`app/api/og/social/[slide]/route.tsx`** — public Satori route; slide ids `1`–`10` (hero, loop, book, flow, open-play, vs-messenger, owners, auto-move, trust, closer); `?format=square|portrait|fb` (1080×1080 / 1080×1350 / 1200×630).
- Brand palette inlined: bg `#062018` deep forest, accent `#34D399` brand-green, card `#0E2A22`, body `#9AB3A8`.
- Shared atoms: `Logo`, `Eyebrow`, `Headline`, `SubCopy`, `Check`, `Pill`, `GhostPill`, `Card` (with 4 absolute-positioned corner `Bracket`s — uses explicit `top/left/right/bottom` per Satori rules), `FeatureCard`, `Frame` (radial-gradient bg).
- Slide-specific mocks: `VenueCardMock`, `SlotGridMock` (chunked rows, no `flexWrap`), `OpenPlayCardMock`, `OwnerDashboardMock`.
- All currency rendered as `PHP ` (Inter has no ₱ glyph in Satori). Owner pill bakes in current launch offer ("FREE TO LIST · 0% PLATFORM FEE FOR YOUR FIRST 2 MONTHS").
- Font loading: same Wget-UA Google Fonts TTF trick + `Promise.allSettled` so CDN flake degrades to system font instead of 500.
- Cache: `public, max-age=300, s-maxage=86400, stale-while-revalidate=604800`.

## 2026-05-20 — Closure auto-move to sibling court (commit `3b38354`)

### Feat — Owner-opt-in auto-move bookings to another court at the same time

- **`features/booking/schema.ts`** — `closureRangeInputSchema.autoReschedule: boolean (default false)`.
- **`features/booking/service.ts`**:
  - `ClosurePreview` adds `autoRescheduleableCount`. `previewClosureRange` counts how many affected bookings have at least one sibling court free at the same time (uses GIST overlap query per candidate).
  - `closeBookingsForRange` now returns `{ result: { cancelledCount, skippedCount, autoRescheduledCount }, cancelledBookingIds, autoRescheduledMoves }`. For each affected booking it iterates sibling courts inside a `tx.transaction(async sp => ...)` SAVEPOINT — first sibling that doesn't trip `23P01` wins; on `23505` (`bookings_one_active_rebook_per_parent`) it stops and falls back to cancellation. Child booking inherits status `confirmed`, snapshotted fees + voucher + contactEmail, `rebookOfId = parent.id`, `cancellableUntil = now+24h`, no payment. Parent is always cancelled with note `[Auto-moved to <newCourtName> · same time]`.
- **`lib/email/templates.ts`** — `bookingRescheduledByOwnerEmail` switches to "Court change" wording (subject `Your booking moved to <Court>`, copy "moved from X to Y. Same time, same price — no payment needed.") when `oldCourtName` is set AND old/new times are equal.
- **`features/booking/notifications.ts`** — new `notifyBookingAutoMoved(newBookingId, oldCourtName, oldStartAt, oldEndAt, reason)` wrapper.
- **`features/owner-venues/actions.ts`** — `closureFormBaseSchema` parses `autoReschedule` from form ("on"/"true"). `previewClosureRangeAction` returns the hint count; `closeBookingsForRangeAction` routes moved bookings through `notifyBookingAutoMoved` and rest through `notifyBookingCancelledByOwner` inside one `Promise.allSettled`.
- **`closure-form.tsx`** — checkbox (default ON when category grants free-rebook AND >1 court) "Auto-move bookings to another court at the same time when possible". Preview card now shows split (X auto-moved · Y emailed reschedule link). CTA changes label & loses destructive tone when moves are expected.

## 2026-05-23 � Venue closures + free player self-rebook (commit `03ff4e9`)

### Feat � Owner closures persist; players rebook cancelled slots at no cost

- **DB migration `0028_booking_rebook_link.sql`** (idempotent, applied) � adds `bookings.rebook_of_id uuid ? bookings(id) ON DELETE SET NULL`, idx, and partial unique idx `bookings_one_active_rebook_per_parent` (parent has at most one active child). Drizzle schema mirrored with `AnyPgColumn` self-FK.
- **Closure persistence** � `closeBookingsForRange` now writes one `court_closures` row per affected court inside the same tx as the force-cancellations. Existing 23P01 (EXCLUDE) collisions are swallowed so a partial-overlap closure still records the cancellations.
- **`rebookFromClosure` service** � validates parent owned + status `cancelled` + category ? `{venue_closure, weather, court_unavailable}` + same venue + 1h grain + future + no active rebook child. Inserts confirmed booking with snapshot fees, `rebook_of_id = parent.id`, no payment. 23P01 ? `slot_not_available`, 23505 ? `booking_wrong_status`.
- **`rebookFromClosureAction`** � auth-redirects to `/sign-in?next=/venues/<slug>/book?rebook=<id>`, rate-limited per-user, revalidates `/me/bookings`.
- **Email + booking page** � owner-cancellation email now includes a green "Pick a new time" CTA with deep-link `�/venues/<slug>/book?rebook=<bookingId>`. The booking flow detects `?rebook=` and (a) shows a green banner with original date/court, (b) locks the duration to the parent's, (c) submits via `rebookFromClosureAction` instead of the normal pay flow.
- **`/me/bookings`** � cancelled bookings eligible for free rebook (no active child yet) render a red banner + "Rebook for free" CTA. `listBookingsForPlayer` now returns `cancellationCategory` and `hasActiveRebook`.

## 2026-05-22 � Open Play: skip "Finish your payment" alert (commit `7635340`)

### Fix � Pending-payment signups auto-redirect to /pay
- `apps/web/src/app/(app)/open-play/[id]/page.tsx` � if the current user has a signup in `pending_payment` status, the session detail page now `redirect()`s straight to `/open-play/signups/[id]/pay`. Previously revisiting the session (e.g. via the OPEN PLAY tile on the booking picker) showed the "Finish your payment / Pay now" alert as an extra hop. Confirmed signups still see the session details normally.

## 2026-05-22 � Open Play polish: readable tile + clearer reserve-and-pay CTA (commit `83fc792`)

### Fix � Picker tile contrast, shimmer placement, and join-page reserve+pay flow

- **Tile readability.** Replaced the pale-gradient + `mix-blend-overlay` full-tile shimmer (washed out text in bright environments) with a solid deep-violet panel (`from-violet-700 via-violet-600 to-fuchsia-600`), white text with `drop-shadow-sm`, white pill for "OPEN PLAY" badge, emerald-400 / red-500 capacity pill, and a 3px shimmer strip on the top edge only � animation never overlays the text. Updated `@keyframes op-shimmer-sweep` to background-position sweep so the edge strip animates correctly.
- **Reserve & pay CTA.** Lifted session title into the JoinForm card itself as a violet header strip ("OPEN PLAY � {title} � Reserve your spot, then complete payment in GCash"). CTA copy sharpened from "Reserve spot � pay �" to **"Reserve & pay {price}"**, and the hint now reads "We'll take you straight to the payment screen. Your spot is held for 15 minutes." The form already auto-routed to `/open-play/signups/{id}/pay` � this is purely visual hierarchy.
- **Multi-court verification.** Confirmed `listOpenPlayForCourts` returns one row per (session, court) via the `open_play_session_courts` join. The existing 6 sessions in DB are all single-court because they were published before yesterday's deploy (migration 0027 backfilled only the primary). New sessions created via the checkbox pill grid will populate every selected court.

## 2026-05-22 � Open Play: multi-court sessions + animated picker tiles

### Feat � Open Play sessions can occupy multiple courts; booking picker shows OPEN PLAY tiles (migration `0027_open_play_multi_court`)

- **Multi-court Open Play.** Owners can now publish one Open Play session that occupies several courts on the same time window. New join table `open_play_session_courts (session_id, court_id, shadow_booking_id NULL, PK(session_id, court_id))` with full RLS (`opsc_public_read` for published+non-deleted parent, owner-only writes via venue join, admin-all). `open_play_sessions.court_id` and `shadow_booking_id` stay populated as the *primary* court/shadow for back-compat � no NOT NULL drops.
- **Publish atomicity.** `publishSession` is now a single transaction that inserts one shadow booking per selected court, catches `23P01` (EXCLUDE conflict) on any one of them, and rolls back the whole publish with `OpenPlayError("slot_not_available", ...)`. Cancel walks the join table and cancels every shadow.
- **Owner form.** Court chooser swapped from `<Select>` to a checkbox pill grid (Tailwind v4 `has-[input:checked]:` selectors, inline SVG checkmark, sr-only inputs). Validator: `courtIds: z.array(uuid).min(1).max(16)` with dedup superRefine.
- **Player UI.** Session list, detail, "pay" page, and "my open play" all display the full court roster (`courts.map(c=>c.name).join(" � ")` or a `N courts � ...` summary chip on the discovery card). `listSignupsForPlayer` and `findSessionWithVenue`-consumers now bulk-fetch via `listCourtsForSessions`.
- **Animated picker tiles (`/venues/[slug]/book`).** New `listOpenPlayForCourts({courtIds, fromAt, toAt})` repo query feeds the booking flow. Each open-play window renders as a wide gradient tile (violet?fuchsia?indigo, `gridColumn: span N`) with a shimmering overlay (`@keyframes op-shimmer-sweep` + `op-tile-pulse` in `globals.css`, both wrapped in `@media (prefers-reduced-motion: no-preference)`), a "OPEN PLAY" badge, time range, capacity progress bar, per-player price, and "Reserve ?" CTA that pushes `/open-play/${sessionId}`. Consumed-hours `Set` prevents double-rendering subsequent hours of the same session.
- **Hard-won fact (added to AGENTS.md):** Open Play sessions can occupy multiple courts via `open_play_session_courts`. `open_play_sessions.court_id` stays populated with the first selected court as `primary` for back-compat. Publish inserts one shadow booking per court inside a single transaction; any EXCLUDE conflict rolls back the whole publish.

## 2026-05-22 (latest) � Polish

### Fix � Venues page: merge duplicate city chips (commit `1126f1a`)

- **City filter chips on `/venues` collapsed to one per city, case-insensitively.** Owners entered cities as free-text so the same place appeared with different casing ("Cabadbaran City" vs "CABADBARAN CITY") and rendered as two separate chips. `listActiveVenueCities` now groups by `lower(city)` and returns a title-cased label (`min(city)` sample ? `toTitleCase`). `listActiveVenues` city filter switched from `eq(city, x)` to `lower(city) = lower(x)` so URL params match regardless of casing. The active chip detector also title-cases the incoming `?city=` param so an inbound link with old casing still highlights the chip.
- **Card display normalised.** Venue cards on `/venues` now go through `toTitleCase` for both `city` and `province`, eliminating the visual contradiction where the chip said "Cabadbaran City" but the card said "CABADBARAN CITY".
- **New `@/lib/casing` util.** Shared `toTitleCase(input)` helper � conservative (only uppercases the first letter of each whitespace/hyphen token, leaves separators alone).
- **Hard-won fact:** user-entered city/province values arrive in mixed casing. Group by `lower(city)` server-side and pass display labels through `toTitleCase`.
- **Files:** `apps/web/src/features/venues/repo.ts`, `apps/web/src/app/(app)/venues/page.tsx`, `apps/web/src/lib/casing.ts` (new).

### Feat � Court form: explicit Indoor/Outdoor radio (commit `efbc3c4`)

- **Replaced the lone "Indoor court" checkbox with a segmented Indoor/Outdoor radio.** The checkbox quietly defaulted Outdoor to a falsy state and there was no visible toggle for outdoor � owners couldn't tell the field even existed. New pill bar in `court-form.tsx` is a `role="radiogroup"` with two `<label>` pills wrapping `sr-only` radios (`name="isIndoor"` values `"true"` / `"false"`), `Home` icon for Indoor, `Sun` icon for Outdoor. Active pill is brand-700 with white text via `has-[input:checked]:`. Defaults: existing courts pre-select based on `initial.isIndoor === true`; new courts default to Outdoor.
- **Zod schema untouched.** `isIndoor` already accepted `"on" | "true" | "false" | undefined` and transformed to a strict boolean, so the new `"false"` value flows through without migration.
- **Files:** `apps/web/src/app/(app)/owner/venues/[id]/courts/court-form.tsx`.

## 2026-05-22 (later)

### Feat � Owner schedule grid view (player-picker style)

- **`/owner/bookings?view=grid` ships as a second view on the schedule page.** Direct answer to "I want it the same as the player slot picker." Above the status tabs there's now an Agenda ? Grid toggle. Grid mode renders the player slot-picker visual: a horizontal 14-day date strip (2-line chips: WED / 20 / MAY), a per-court tab row (when the venue has >1 active court), then a stacked column of hourly tiles for the selected court+day showing open / past / closed / booked states. Booked tiles fill the whole booking span (first hour shows player first name, continuations show "? cont'd"). Bottom strip summarises booked hours, utilisation %, and confirmed revenue.
- **Tone-driven tiles, not generic chips.** Confirmed = filled brand-700 with white text. Pending = warning-50/300. Refunded = muted strike. Open play = info. Past = neutral subtle. Closed = dashed danger. Open = white with brand hover ring.
- **New repo function `getOwnerGridData`.** Re-verifies venue ownership server-side, loads active courts ordered by name, picks the requested court (or falls back to the first), pulls bookings (overlap window, excluding `cancelled / no_show / expired`) and `court_closures` (excluding soft-deleted). Returns `null` only when the venue isn't owned. `courtId` arg is optional with internal fallback � caller never has to do a two-pass lookup.
- **Dashboard tile retargeted.** `/owner` Schedule quick-action now links to `/owner/bookings?view=grid` ("Hourly grid by court") since the grid is what the user actually asked for.
- **Files:** `apps/web/src/features/bookings-view/repo.ts`, `apps/web/src/features/bookings-view/index.ts`, `apps/web/src/app/(app)/owner/bookings/page.tsx`, `apps/web/src/app/(app)/owner/page.tsx`.

## 2026-05-22

### Feat � Owner schedule view (day-grouped agenda + tap-to-contact)

- **`/owner/bookings` rewritten as a day-grouped agenda.** Was: flat table sorted DESC. Now: sticky day headers (`Today � �`, `Tomorrow � �`, `Yesterday � �`, else long Manila date) with booking count, then a list of rows per day. Each row has a left time block (start / `to` / end in Manila time), player name + status badge + chevron linking to the booking detail, court + total amount, and a chip row with tap-to-call (`tel:`) and tap-to-email (`mailto:`) � the answer to "I want easy access like a calendar view that shows all date and time to all booked players."
- **Upcoming-first by default.** `STATUS_TABS` reordered so `Upcoming` is first and is the default. `listBookingsForOwner` flips its sort: `upcoming` orders by `startAt ASC` (soonest first), every other filter stays `DESC`. Cursor predicate flips with the sort direction so pagination works in both modes.
- **Player contact in the projection.** `OwnerBookingListItem` extended with `player: { email, phoneE164 }`. SELECT now joins `profiles.email` + `profiles.phoneE164` (already in scope � no extra join). Safe: this surface is owner-only, and these fields exist solely to let an owner contact a player who already booked their court.
- **Dashboard discoverability.** Added a `Schedule` quick-action tile to `/owner` (first tile in the Manage grid, `CalendarDays` icon, links to `/owner/bookings?status=upcoming`).
- **Files:** `apps/web/src/features/bookings-view/repo.ts`, `apps/web/src/app/(app)/owner/bookings/page.tsx`, `apps/web/src/app/(app)/owner/page.tsx`.

## 2026-05-21 (much later)

### Feat � Platform-wide 1-hour slot granularity (commit `1ec3a94`)

- **Why.** Player and owner feedback: "only 1hr. no 30mins or 40mins what so ever." 30-min increments were creating noisy slot pickers and ambiguous open-play windows.
- **DB invariants flipped (migration `0026_one_hour_slots.sql`).** Dropped `booking_min_30_min`, `booking_30_min_grain`, `ops_min_30_min`, `ops_30_min_grain`. Added `booking_min_1_hour`, `booking_1_hour_grain`, `ops_min_1_hour`, `ops_1_hour_grain`. Pre-verified zero violations across 75 bookings and 5 open-play sessions before applying.
- **App-layer enforcement.** `validateSlotTimes` in `features/booking/schema.ts` and `features/open-play/schema.ts` now requires `60 = minutes = 240` AND `minutes % 60 === 0` AND UTC `minutes/seconds/ms === 0`. Voucher `durationMinutes` validator matches. `generateDaySlotsManila` only emits `h:00`. Terms copy and owner open-play form hint updated to "minimum 1 hour � 1-hour increments".
- **Test fixtures.** `nextHalfHour` ? `nextHour`. `slotMs = 60 * 60_000`. Past-time snap rewritten with `setUTCMinutes(0)`. Test renamed "non-30-minute grain" ? "non-hourly grain".
- **Invariant docs.** `.github/copilot-instructions.md` and `AGENTS.md` updated so future agents do not re-propose 30-min slots.

## 2026-05-21 (later, before 1-hr slots)

### Feat � Surface Share availability on dashboard + venue cards (commit `ae62e20`)

- Owner dashboard gains a `Share availability` quick-action tile (only when the owner has at least one shareable venue). Per-venue cards also link to the share composer. Discoverability was zero before � the route existed but nothing pointed to it.

## 2026-05-21 (later)

### Polish � Availability poster: per-hour chips, bigger QR, "Scan or tap to book"

- **Per-hour slot chips.** Was: one merged pill per range (e.g. `6 AM � 10 PM`). Now: one pill per 1-hour slot (`6�7 AM`, `7�8 AM`, �, `11 PM�12 AM`), so the poster shows exactly how the booking grid is bookable. `expandHourlySlots` flattens `ShareSlotRange[]` to per-hour labels via `formatHourSlotLabel(h)` (en-dash, period-collapse when both ends share AM/PM).
- **Manual row chunking via `SlotGrid`.** Satori's `flexWrap: "wrap"` is unreliable for variable-width pills inside nested flex containers � chips kept overflowing the right edge even with explicit width, `flexShrink: 0`, and no wrapper divs. Replaced with a column-of-rows: `chunk(labels, perRow)` ? each row a flex row of pills with per-pill `marginRight` (last child trimmed). Caps at 12 (FB / portrait, 4 per row) and 8�12 (square, 4 per row) with a green `+N more` indicator pill.
- **Bigger, scannable QR.** FB 200px, IG-portrait 180px, IG-square 150px (was 90�100). Card padding, eyebrow size, URL size, and gap all scale with QR size. URL allows wrapping (`lineHeight: 1.2`) � Satori's `whiteSpace: nowrap + textOverflow: ellipsis` does not actually clip.
- **CTA copy.** Eyebrow above QR now reads `SCAN OR TAP TO BOOK` (uppercase, `0.1em` letter-spacing) instead of `SCAN TO BOOK`.
- **Files:** `apps/web/src/app/api/og/availability/[slug]/route.tsx` (only).
- **Hard-won (added to `AGENTS.md`):** Satori `flexWrap: "wrap"` is unreliable for variable-width children in nested flex containers � chunk into rows manually. Text ellipsis is also unreliable � prefer wrapping with `lineHeight`.

## 2026-05-21

### Fixed � Owner availability poster returned HTTP 500 in production (couldn't preview or download)

- **Symptom:** all three formats of `/api/og/availability/[slug]` returned 500 with an HTML error body. Share-page download saved an HTML file masquerading as `.png`; preview `<img>` was broken.
- **Root cause:** Satori (the engine behind `next/og`) **rejects woff2** with `Unsupported OpenType signature wOF2`. The previous font loader pulled woff2 from `@fontsource` / direct Google Fonts WOFF2 CDN, so every render threw before producing pixels.
- **Fix:**
  - Font loader rewrites the Google Fonts CSS endpoint request with `User-Agent: Wget/1.20.3 (linux-gnu)` � that UA causes Google to return `src: url(...ttf)` instead of opaque `/l/font?kit=` blobs. We parse the `.ttf` URL out of the CSS and feed the TTF buffer to Satori. Wrapped in `Promise.allSettled` so a CDN hiccup degrades to system font instead of 500.
  - `formatPesoForOg(centavos)` replaces `\u20B1` with `"PHP "` only inside the OG route, because Inter v20 from Google Fonts has no glyph for ? and was rendering tofu boxes. `formatPHP` from `@/lib/money` is unchanged everywhere else.
  - `HeroBackdrop` no longer attempts to fetch the venue cover photo (remote images in Satori are unreliable � content-type/CORS/WebP issues). Hero now paints the brand gradient (`brandDark ? brand ? accent`) with a radial highlight and bottom-darken overlay. All absolute layers use explicit `top/left/right/bottom: 0` + `width/height: 100%` because Satori zero-sizes `inset: 0` containers whose only children are also absolute. Gradients use `backgroundImage` (separate from `backgroundColor`).
  - IgPortrait + IgSquare venue-title blocks pushed up (`bottom: 200` and `bottom: 140` respectively) so they no longer collide with the white info card.
  - `ImageResponse(...)` wrapped in try/catch reporting to Sentry with scope `og:availability` and slug/format extras.
- **Files:** `apps/web/src/app/api/og/availability/[slug]/route.tsx` (only this file).
- **Hard-won (added to `AGENTS.md`):**
  - Satori **does not support woff2** � always feed TTF/OTF.
  - Google Fonts CSS endpoint with `User-Agent: Wget/1.20.3 (linux-gnu)` returns clean `src: url(...ttf)` URLs; with a browser UA you get `/l/font?kit=` blobs that aren't fonts.
  - Satori CSS quirks: prefer explicit `top/left/right/bottom: 0` + `width:"100%",height:"100%"` over `inset: 0`; use `backgroundImage` (not `background` shorthand) for gradients; avoid remote raster images when a CSS gradient will do.
  - Inter (Google Fonts v20) has no ? glyph � replace with `"PHP "` in any Satori-rendered context.

## 2026-05-20

### Added � Owner "Share availability" poster (FB / IG / link card)

- **Goal:** give venue owners a one-tap way to promote open courts to their own Facebook page, groups, and Messenger without us building a Pages-API integration (which would need Meta App Review).
- **How:** server-rendered branded image at `/api/og/availability/[slug]` (Satori via `next/og`, `runtime = "nodejs"`) + composer at `/owner/venues/[id]/share`. Image embeds court name, the day's open ranges with rates, hero court photo, DinkHub wordmark, and a QR that resolves to the deep-link booking page (`/venues/<slug>/book?date=&court=`). Three sizes: IG Story (1080�1350), IG Square (1080�1080), FB / link preview (1200�630).
- **Sharing flow:** Download image ? Facebook share dialog opens with the deep link pre-filled ? owner attaches the downloaded image inside the dialog. No tokens, no OAuth, works for any FB page or group the owner already manages. Caption + booking-link copy chips included.
- **Files:**
  - `apps/web/src/features/share/service.ts` � Manila-tz availability computation (24h boolean array, merges consecutive open hours, collects rates per range via `getRateForHour`). Wrapped with React `cache()`.
  - `apps/web/src/features/share/index.ts` � public barrel.
  - `apps/web/src/app/api/og/availability/[slug]/route.tsx` � Satori image route with three layout components, Inter 400/700/900 from Google Fonts CDN (`cache: "force-cache"`), QR via `qrcode@1.5.4`, brand hex palette inlined (Satori can't resolve CSS vars). Cache headers: 1m browser, 5m s-maxage, 10m SWR.
  - `apps/web/src/app/(app)/owner/venues/[id]/share/page.tsx` � server page; reuses owner auth gate from `getVenueWithCourtsForOwner`. Requires `venue.status === "active"` and =1 active court.
  - `apps/web/src/app/(app)/owner/venues/[id]/share/share-client.tsx` � composer with date chips (next 7 days + free-form picker), court chips, format tabs, live `<img>` preview, refresh button (nonce cache-bust), Download / Share-to-Facebook / Copy-caption / Copy-link actions. Inline `FacebookIcon` SVG since `lucide-react` has no Facebook icon.
  - `apps/web/src/app/(app)/owner/venues/[id]/page.tsx` � gradient "Share availability" CTA card on the owner venue page (only when venue is live + has active courts).
- **Dependencies:** `qrcode@^1.5.4`, `@types/qrcode@^1.5.6` (transitively safe; pure JS, no native bindings).
- **Auth posture:** the image route is intentionally public � the underlying data is what the booking page already shows. Rate-limit can be added if a hot venue gets scraped.
- **Hard-won:** Satori is strict � every multi-child container must have `display: "flex"`, no `gap` (use margin), no grid, no CSS custom properties. `exactOptionalPropertyTypes` requires `...(value ? { key: value } : {})` spreading instead of passing `key: maybeUndefined` directly.
- Commit: `9a3bda8` ? production https://dinkhub.ph

## 2026-05-19

### Fixed � "Application error: a client-side exception has occurred"

- **Symptom:** intermittent generic error page that disappears on refresh. Could appear on any route.
- **Root cause:** classic Next.js stale-chunk issue after a Vercel deploy � the user's already-loaded HTML references JS chunks (by content hash) from the previous build. When the page tries to load a chunk Vercel has already replaced, webpack throws `ChunkLoadError`. With no route-level error boundary in `(app)`, the failure bubbled to `global-error.tsx` which rendered Next's stark default `NextError` message.
- **Fix:**
  - New `apps/web/src/app/(app)/error.tsx` route-level boundary that:
    - Detects `ChunkLoadError` (and the four other names browsers use for it) and triggers exactly one hard reload, gated by a `sessionStorage` flag so it cannot loop if the reload itself fails. User sees a calm "Updating to the latest version�" spinner instead of an error.
    - For real runtime errors, renders a branded recovery card with `Try again` (calls `reset()`) and `Go home` buttons, plus the Sentry digest reference for support correlation.
    - Pipes every non-chunk error to Sentry tagged `boundary: "app-segment"` with the digest in `extra`.
  - Rewrote `apps/web/src/app/global-error.tsx` (root-layout-failure fallback) from the stark `NextError` widget to an inline-styled friendly card with `Try again` / `Go home`. Inline styles because the root layout has failed ? no Tailwind tokens / fonts available.
- Files:
  - `apps/web/src/app/(app)/error.tsx` (new)
  - `apps/web/src/app/global-error.tsx` (rewritten)

## 2026-05-18 (later 8)

### Chore G�� Remove Cloudflare Turnstile / CAPTCHA from all flows

- User reported the CAPTCHA widget was throwing "system failure" errors on sign-in / sign-up. Server-side `verifyTurnstileToken` had already been a no-op, and the React widget was no longer rendered anywhere, but the dead imports, env vars, and copy mentions remained G�� and the client-side script load was likely the source of the failure.
- Removed every reference to Turnstile across the codebase:
  - Deleted `apps/web/src/lib/turnstile.ts` and `apps/web/src/components/turnstile-widget.tsx`.
  - Extracted the still-needed `getClientIp` helper (used for per-IP rate-limit identifiers) into a new `apps/web/src/lib/client-ip.ts`.
  - Stripped `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `lib/env.ts` (both schema entries and the `processEnv` map).
  - Dropped the dead verify block + unused `headers` import from `features/owner-invoices/actions.ts`.
  - Simplified `preflightAuthGate` in `features/auth/actions.ts` to a rate-limit-only check (no args, no captcha plumbing).
  - Removed stale captcha comments in `book/[bookingId]/pay/receipt-form.tsx`, `venues/[slug]/book/booking-flow.tsx`, and `features/booking/actions.ts`.
  - Rewrote the `host` FAQ ("verified email + per-user rate limits") and the `privacy` policy IP-address bullet and removed the Cloudflare CAPTCHA processor entry.
  - Removed the `TURNSTILE_SITE_KEY G�� NEXT_PUBLIC_TURNSTILE_SITE_KEY` rename mapping from `scripts/push-env-to-vercel.ps1`.
- Per-IP / per-user rate limits remain the abuse defence for auth, booking-create, and receipt-upload.
- **Follow-up for the operator:** delete `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from the Vercel project env vars (they're now unused and will fail-fast the env validator if anything references them later).
- Verified: `pnpm --filter web typecheck` G��, `pnpm --filter web lint` G��. Commits `557fc53` + `c57304f`.

## 2026-05-18 (later 7)

### Fix G�� Booking slots auto-release the moment the 15-min payment window lapses

- Symmetric fix to the open-play stale-signup bug from earlier today. A booking that the player created but never paid for could keep a court slot marked as "taken" for up to ~60s (until the every-minute cron flipped it to `expired`). For the next player trying to book the same slot, this manifested as either a phantom busy mark in the picker or a `slot_not_available` error on submit.
- **Fix, defence in depth:**
  1. **Query-level (instant UX):** added `AND NOT (status = 'pending_payment' AND payment_due_at <= now())` to all three court-availability queries in `features/venues/repo.ts` G�� `getCourtOccupancy` (single court picker), `getCourtsOccupancy` (batch picker for the booking page), and `getVenueAvailabilityMap` busy CTE (the home/listing availability grid). Display is now correct on every page load.
  2. **Create-time (no phantom EXCLUDE violation):** new `expireOverlappingStalePendingBookings({ courtId, startAt, endAt })` helper in `features/booking/repo.ts` runs inside the same transaction as `insertBooking`, flipping any overlapping `pending_payment` booking on the same court whose 15-min window already lapsed. The `EXCLUDE USING gist` constraint then sees them as `expired` and lets the new booking through. Court-scoped + time-scoped so it never touches unrelated rows.
- Doesn't change the EXCLUDE constraint itself (postgres `WHERE` predicates on partial indexes must be immutable, so `now()` can't be referenced there).
- The every-minute cron (`/api/cron/expire`) still flips stale rows globally as a backstop.
- Files:
  - `apps/web/src/features/venues/repo.ts` (3 SQL queries patched)
  - `apps/web/src/features/booking/repo.ts` (new `expireOverlappingStalePendingBookings`)
  - `apps/web/src/features/booking/service.ts` (call helper inside `createBooking` tx, before `insertBooking`)
- Verified: `pnpm --filter web typecheck` G��, `pnpm --filter web lint` G��.

## 2026-05-18 (later 6)

### Fix G�� Open Play "filled slots" no longer count stale unpaid signups

- **Bug:** A player who joined an Open Play session but never uploaded a GCash receipt still counted as a filled slot for up to ~45 minutes (the 15-min payment window + the 30-min reminder cron interval). Other players saw the session as fuller than it really was.
- **Fix, defence in depth:**
  1. **Query-level (instant):** introduced a shared `activeSignupWhere` SQL fragment in `features/open-play/repo.ts` that excludes signups in `pending_payment` past their `payment_due_at`. Applied to all four count queries G�� `listPublishedSessions`, `listSessionsByVenue`, `listSessionsByOwner`, and `countActiveSignups` (used by the public session detail page and the join-capacity check). `activeSignupCount` is now correct on every page load, regardless of cron timing.
  2. **Cron-level (DB consistency):** added `expirePendingSignups` to the every-minute `/api/cron/expire` route (alongside `releaseExpiredHolds` and `expireUnpaidBookings`), so the row actually flips to `expired` within ~60s. The existing every-30-min `open-play-reminder` cron still calls it as a backstop.
- Knock-on benefits:
  - The join-capacity check (`countActiveSignups` in `service.joinSession`) now releases the seat immediately once the previous player's window lapses G�� no need to wait for the cron.
  - Owner dashboards see accurate counts in real time.
- Files:
  - `apps/web/src/features/open-play/repo.ts` (new `activeSignupWhere` fragment + 4 query updates)
  - `apps/web/src/features/open-play/index.ts` (export `expirePendingSignups`)
  - `apps/web/src/app/api/cron/expire/route.ts` (added open-play signup expiration)
- Verified: `pnpm --filter web typecheck` G��, `pnpm --filter web lint` G��.

## 2026-05-18 (later 5)

### Feature G�� "Enable location" prompt + distance sort on /venues and /open-play

- Slim inline pill on both `/venues` and `/open-play` invites the user to share their location and re-sorts results by distance. Designed to be small (single line on desktop, wraps on mobile), so it never pushes the grid below the fold.
- Two visual states:
  - **Idle:** rounded-full pill with brand-gradient background, MapPin badge, headline ("See courts/sessions nearest you"), inline Enable button + dismiss `+�`. Errors (permission denied / timeout / generic) replace the headline in red and the button becomes "Retry".
  - **Active:** compact brand-tinted pill ("Sorted by distance from you") with a Clear link that strips `?lat&lng` from the URL.
- Distance computed with the haversine formula in JS (no PostGIS yet G�� fine at launch-market scale). When `near` is supplied, repos widen the DB fetch to a larger pool (up to 100G��200 rows), compute distance for every row, sort ascending with nulls last, then slice back to the user-visible limit.
- Per-card distance pill (`850 m` / `2.3 km` / `14 km`) appears next to the city on each result card so the "Sorted by distance" claim is visually concrete.
- URL is the source of truth (`?lat=&lng=`) so the lens is shareable / bookmarkable / preserved across other filter changes (city, sort, query).
- Coordinates cached in `sessionStorage` for 1h so enabling on `/venues` carries over to `/open-play` automatically (no second permission prompt needed within the same browser session).
- Dismissal persisted in `localStorage` per-scope (`dinkhub-location-prompt:venues:dismissed` / `:open-play:dismissed`) so a user who hides the prompt on one surface still sees it on the other.
- Validation: ignores out-of-range lat/lng (lat G�� [-90,90] or lng G�� [-180,180]); silently drops malformed URLs rather than 500-ing.
- A11y: respects `prefers-reduced-motion` (no animation added); buttons have accessible labels; `aria-live="polite"` on the error message; geolocation requested with `enableHighAccuracy: false`, 8s timeout, 5-min stale OK.
- Files:
  - `apps/web/src/lib/distance.ts` (new G�� `haversineKm`, `formatDistanceKm`)
  - `apps/web/src/components/location-prompt.tsx` (new client island)
  - `apps/web/src/features/venues/repo.ts` (added `near` option + `distanceKm` field)
  - `apps/web/src/features/open-play/repo.ts` (added `near` option + `distanceKm` field on `SessionListItem`)
  - `apps/web/src/app/(app)/venues/page.tsx` (parse + pass `near`, mount prompt, show distance on cards, preserve `lat/lng` across filter nav)
  - `apps/web/src/app/(app)/open-play/page.tsx` (parse + pass `near`, mount prompt, show distance on cards)
- Verified: `pnpm --filter web typecheck` G��, `pnpm --filter web lint` G��.

## 2026-05-18 (later 4)

### Feature G�� Animated launch announcement modal

- New one-time popup announcing that Open Play is live, mounted globally in the `(app)` route group so it surfaces on the home page, venue listings, profile, etc. Suppressed on `/open-play/*`, `/owner/*`, `/admin/*`, and all auth routes (don't interrupt task-focused flows or pages where the announcement would be redundant).
- Pickleball-themed visuals G�� no images, all SVG + CSS:
  - Bouncing yellow pickleball (radial-gradient face, six holes, highlight) with a soft scaling ground shadow for weight.
  - Swinging green paddle (brand colors) behind the ball as a continuous loop.
  - 16-piece confetti burst on open using brand + accent + warning + info tokens, each piece randomized via CSS custom properties (`--cx`, `--cy`, `--cr`).
  - Spring-overshoot entrance (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for the modal, fade for the backdrop.
  - Pulsing red "LIVE" badge in the top-left of the hero.
- Behavior:
  - 1.8s delay after first eligible page load (lets the page settle so it feels like an event, not a blocker).
  - Dismissed-once-per-device via `localStorage["dinkhub-announce:open-play-launch-v1"]`. Key versioned so future announcements re-surface for existing users.
  - Full a11y: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, ESC closes, backdrop click closes, primary CTA auto-focuses, body scroll locked while open, close button has accessible label.
  - Respects `prefers-reduced-motion` G�� already handled globally in `globals.css` (`animation-duration: 0.01ms !important`), so the modal still appears but without the bounce/swing/confetti motion.
  - No new dependencies. Pure CSS keyframes added to `globals.css`.
- Primary CTA links to `/open-play` and dismisses on click. Secondary "Maybe later" simply dismisses.
- Files:
  - `apps/web/src/components/launch-announcement.tsx` (new, ~250 lines client component with inline pickleball + paddle SVG)
  - `apps/web/src/app/(app)/layout.tsx` (mount once at the end of the layout)
  - `apps/web/src/app/globals.css` (7 new keyframes + utility classes under a "Launch announcement modal" section)
- Verified: `pnpm typecheck` G��, `pnpm lint` G��.

## 2026-05-18 (later 3)

### Polish G�� Open Play feedback & share UX

- Added `sonner` toast notifications for the four owner/player open-play actions that previously refreshed the page silently: publish session, cancel session, verify payment, reject payment, and cancel signup. Each emits a one-line success toast (top-center, 3.5s, rich colors) so users get explicit confirmation that the server action landed.
- `<Toaster />` mounted once in the root layout G�� single instance covers the whole app.
- Owner session detail share card overhauled: instead of a small inline link, the published-session card now shows the full URL in a monospace code box with a `CopyButton`, plus a full-width "Preview public page" outline button (`buttonVariants`) that opens the listing in a new tab. Pattern matches the GCash-number block on the open-play pay page.
- Session creation form gains a helper hint on the **Start** field G�� "Asia/Manila time G�� what players will see on the listing." G�� to prevent the timezone confusion that bit us when browser-local differs from venue-local.
- Files (modified):
  - `apps/web/src/app/layout.tsx` (mount `<Toaster />`)
  - `apps/web/src/app/(app)/owner/open-play/[sessionId]/owner-actions.tsx` (toasts on 4 actions)
  - `apps/web/src/app/(app)/owner/open-play/[sessionId]/page.tsx` (share card redesign)
  - `apps/web/src/app/(app)/me/open-play/cancel-signup-button.tsx` (toast on cancel)
  - `apps/web/src/app/(app)/owner/venues/[id]/open-play/new/session-form.tsx` (Manila hint)
- Dependencies: added `sonner@2.0.7` to `apps/web` (~5KB, shadcn-recommended toast primitive).

## 2026-05-18 (later 2)

### Removed G�� Launch promo (replaced by vouchers)

- The platform-wide "launch promo" toggle is gone. Vouchers (per-code, optionally venue-scoped) now handle every discount use case, so the promo is dead weight.
- Booking fee always falls through to the admin-configured base fee (snapshotted to each new booking row as before). Existing bookings keep whatever fee they were created with G�� no historical data is rewritten.
- Removed UI: top-strip banner across the app, hero callout on `/host`, booking-page callout, "Promo active" empty state on `/owner/invoices`, "Booking fees waived" tone on the owner balance card, the entire "Launch promo" card on `/admin/settings`, and the "Promo status" summary card.
- Removed code: `components/promo-banner.tsx`, `getPromoState`, `PromoState`, `promoApplied` flag on `BookingFeeRule`, all `promo*` form fields + Zod schema entries.
- Migration `0023_drop_promo.sql`: drops `promo_active`, `promo_headline`, `promo_description`, `promo_until_date`, `promo_show_on_home`, `promo_show_on_booking` from `system_settings`. Apply via Supabase SQL editor.
- Files (new):
  - `apps/web/src/db/migrations/0023_drop_promo.sql`
- Files (deleted):
  - `apps/web/src/components/promo-banner.tsx`
- Files (modified): `db/schema/index.ts`, `features/system-settings/{service,schema,actions,index}.ts`, `features/booking/service.ts`, `features/booking/__tests__/service.test.ts`, `features/owner-invoices/components/owner-balance-card.tsx`, `app/(app)/{layout,host/page,owner/invoices/page,venues/[slug]/book/page,admin/settings/page,admin/settings/settings-form}.tsx`

## 2026-05-18 (later)

### Added G�� Optional venue scoping on vouchers

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

### Added G�� Voucher (discount code) system for booking fees

- Admins can create promo codes that discount the system booking fee (either percent off, e.g. `LAUNCH20` = 20% off, or flat G�� off). Codes have optional total-use caps, per-player caps, minimum court fee, and expiry date. Players paste the code on Step 1 of the booking flow, click Apply, see the discounted fee in the summary, then proceed to payment with the discounted amount.
- **Architecture (Option B):** discount is baked into `system_fee_centavos` at booking creation. The generated `total_centavos` column (court_fee + system_fee) is untouched, so historical totals stay consistent. Three audit columns added to `bookings`: `voucher_id`, `voucher_code_snapshot`, `discount_centavos`.
- **Atomic redemption:** `tryIncrementVoucherRedemption` uses an UPDATE with a WHERE clause inside the booking transaction G�� physically impossible to exceed `max_redemptions`.
- **Per-user cap** enforced by counting existing redemptions for `(voucher_id, user_id)` inside the booking tx.
- **Discount never exceeds base system fee** G�� capped server-side in `validateVoucherForBooking`.
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

### Fixed G�� booking page showed stale system fee (G��20 instead of admin-set G��15)

- **Root cause:** the system has two fee tables G�� a legacy `system_fee_settings` history table and a newer `system_settings` singleton. Admin's settings form writes to the singleton, but `findCurrentSystemFeeCentavos` (which the public booking page calls to display the fee estimate) was still reading from the legacy table. Booking creation already read from the correct singleton, so bookings were *charging* G��15 while the page *displayed* G��20 G�� a trust-breaking mismatch.
- **Fix:** `findCurrentSystemFeeCentavos` now delegates to `getCurrentBookingFeeRule()` (the single source of truth). Legacy table only used as fallback if the singleton row is missing (test fixtures / un-migrated envs).
- Files:
  - `apps/web/src/features/booking/repo.ts`

## 2026-05-17 (evening, later 2)

### Admin (system) dashboard G�� audit + polish

- Audited `/admin/*` end-to-end: all 15 routes load real DB data, all 14 server actions guarded by `requireAdmin()`, audit logging on every mutation, double-entry ledger intact, optimistic concurrency throughout, query scoping correct (admin sees everything; not filtered by owner_id).
- **Added** loading.tsx for all 5 admin detail pages (venues, users, bookings, payouts, invoices) G�� previously users saw a blank screen during the multi-join DB queries.
- **Fixed** invoice receipt image eager-loads on the admin invoice detail page (was `lazy`, felt slow on a page where the receipt IS the primary content).
- Files:
  - `apps/web/src/app/(app)/admin/venues/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/users/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/bookings/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/payouts/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/loading.tsx` (new)
  - `apps/web/src/app/(app)/admin/invoices/[id]/page.tsx`

## 2026-05-17 (evening, later)

### Owner dashboard G�� audit + polish

- Ran end-to-end audit of `/owner/*` pages: all routes load real DB data, all forms wired to real server actions, RLS/authorization checks confirmed throughout, optimistic concurrency intact.
- **Added** prominent warning Alert on payment review card when receipt amount doesn't match expected total G�� previously the mismatch was only a tiny red text easy to miss when verifying GCash payments.
- **Added** loading state for `/owner/venues/[id]/courts/new` route (was missing G�� users saw blank while form loaded).
- Files:
  - `apps/web/src/app/(app)/owner/payments/review-card.tsx`
  - `apps/web/src/app/(app)/owner/venues/[id]/courts/loading.tsx` (new)

## 2026-05-17 (evening)

### Removed G�� CAPTCHA disabled across all forms

- **Why:** Private launch with ~100 invited users G�� bot signup/spam is not a realistic threat at this scale. The CAPTCHA was causing real users on mobile / distant networks to get stuck on "Security check failed".
- **Server:** `verifyTurnstileToken` now hard-returns `{ success: true, skipped: true }` regardless of environment. Original logic preserved below the early return so re-enabling is a one-line revert later.
- **Client:** `<TurnstileWidget>` removed from sign-up, sign-in, forgot-password, and invoice-receipt forms.
- Files:
  - `apps/web/src/lib/turnstile.ts`
  - `apps/web/src/app/(auth)/sign-up/page.tsx`
  - `apps/web/src/app/(auth)/sign-in/page.tsx`
  - `apps/web/src/app/(auth)/forgot-password/page.tsx`
  - `apps/web/src/app/(app)/owner/invoices/[id]/pay-form.tsx`

## 2026-05-17 (later)

### Fixed G�� Turnstile failing on mobile / distant networks

- **Issue:** Users on Android browsers from regions far from their usual location (e.g. ~200km away) were seeing "Security check failed G�� please retry" with no visible CAPTCHA to solve.
- **Root cause:** The Turnstile widget was rendered with `appearance: "interaction-only"`, which keeps the iframe invisible. When Cloudflare's risk engine flags a session (mobile carriers, unfamiliar geos, older Android WebViews) it requires the user to complete an interactive challenge G�� but with the widget hidden, there was nothing to click, so no token was ever produced.
- **Fix:** Changed appearance to `"always"`. Low-risk sessions still complete silently (brief "VerifyingGǪ" spinner), and flagged sessions now get a visible challenge they can actually solve.
- File: `apps/web/src/components/turnstile-widget.tsx`

### Fixed G�� Sign-up email verification link

- Added explicit `emailRedirectTo` on `supabase.auth.signUp` so the confirmation link in the verification email points to our `NEXT_PUBLIC_APP_URL/sign-in` instead of relying on Supabase's dashboard "Site URL" fallback.
- File: `apps/web/src/features/auth/service.ts`
- **Action required in Supabase dashboard** (see notes below) to enable confirmation emails.

## 2026-05-17

### Added G�� Booking detail page redesign (`/me/bookings/[id]`)

- **Hero card** with venue cover photo, gradient overlay, prominent status badge, and venue identity (avatar + name + address)
- **4-step progress bar** (Submitted G�� Under Review G�� Confirmed G�� Completed) derived from booking status and end time
- **Redesigned Booking Summary** card with prominent date, court schedule with indoor/outdoor badge, time range, duration, and itemized total (court fee, system fee, total paid)
- **Action buttons** (2+�2 grid):
  - **Add to Calendar** G�� generates `.ics` file client-side and triggers download
  - **Get Directions** G�� opens Google Maps directions (uses venue coords when set, falls back to address search)
  - **Contact Venue** G�� `tel:` link to venue owner's phone (graceful "No phone listed" state when missing)
  - **View Receipt** G�� opens signed receipt URL in a new tab
- Owner phone now fetched via a small `profiles.phoneE164` lookup keyed on `venue.ownerId`

### Files

- `apps/web/src/app/(app)/me/bookings/[id]/page.tsx` G�� full visual redesign; all existing functionality (status alerts, payment receipt card, review form, cancel button, "Pay now" CTA) preserved
- `apps/web/src/app/(app)/me/bookings/_components/booking-action-buttons.tsx` G�� new client component (RFC 5545 ICS builder + 4 action tiles)

## 2026-05-16

### Fixed G�� Payment submission flow

- Silent failure when no receipt file was attached G�� now returns `"file_required"` with a clear inline error
- Missing error display on rejection responses G�� errors now surface to the player
- Double-submit causing `"booking is payment_submitted"` error G�� added `disabled` state via shared `SubmitButton` (driven by `useFormStatus`) and a `pendingLabel` spinner during upload
- Slow submit perceived as a hang G�� email/SMS notifications deferred via Next's `after()` so the response returns before sending. Applied to `submit`, `verify`, and `reject` actions.

### Build/deploy

- Fixed stray `}` in `apps/web/src/app/(app)/venues/[slug]/book/booking-flow.tsx` Alert import that broke the Vercel build
- Vercel: disabled "Require Log In" deployment protection; git author email aligned with GitHub account

## 2026-05-14

### Fixed � alt-tab freeze (mobile menu scroll-lock leak)

- **Bug:** After switching to another app/tab and returning to dinkhub.ph, the page looked normal but nothing was clickable. Refresh was the only fix.
- **Root cause:** Opening the mobile menu sets document.body.style.position = "fixed" to lock scroll behind the drawer. If the user alt-tabbed away while the menu was open (or React's effect cleanup got interrupted by Fast Refresh / navigation / React 19 concurrent mode), the cleanup that restores position could be skipped � leaving the body locked and the whole page apparently frozen.
- **Fix:** Added a isibilitychange listener in Navbar that force-clears all body scroll-lock styles whenever the page becomes visible AND the mobile menu is not currently open. Zero-cost safety net.
- Files:
  - `apps/web/src/components/navbar.tsx` (new effect alongside existing unmount guard)
- Commit `b19b182`.
