# Changelog

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
