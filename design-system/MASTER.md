# DinkHub Design System v1.0

> **Brand:** Pickleball court booking marketplace · **Market:** Philippines (launch: Agusan del Sur)
> **Personality:** Energetic, trustworthy, community-focused, distinctly Filipino
> **Tone:** Friendly, direct, action-oriented · **Audience:** Players (18-55) + Venue owners

---

## 1. Color System

### Brand colors
The DinkHub palette pairs **court green** (pickleball association, growth, action) with **sunset orange** (Filipino warmth, energy, urgency-without-aggression). Neutrals are warm-leaning to feel approachable, not corporate.

| Token | Light value | Dark value | Usage |
|---|---|---|---|
| `--color-brand-50` | `#ECFDF4` | `#052E18` | Tints, hover backgrounds |
| `--color-brand-100` | `#D1FADF` | `#064E29` | Subtle backgrounds |
| `--color-brand-300` | `#6CE9A6` | `#12B76A` | Decorative |
| `--color-brand-500` | `#12B76A` | `#32D583` | **Primary brand (court green)** |
| `--color-brand-600` | `#039855` | `#6CE9A6` | Primary hover |
| `--color-brand-700` | `#027A48` | `#A6F4C5` | Primary active |
| `--color-brand-900` | `#054F31` | `#D1FADF` | Brand text on light |
| `--color-accent-500` | `#F97316` | `#FB923C` | **Accent (sunset orange)** — CTAs, badges |
| `--color-accent-600` | `#EA580C` | `#F97316` | Accent hover |

### Semantic colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-success-500` | `#12B76A` | `#32D583` | Confirmed bookings, paid |
| `--color-warning-500` | `#F79009` | `#FDB022` | Pending verification |
| `--color-danger-500` | `#F04438` | `#F97066` | Cancelled, errors |
| `--color-info-500` | `#0BA5EC` | `#36BFFA` | Informational |

### Neutrals (warm gray, not pure)

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#FFFFFF` | `#0C0C0E` |
| `--color-bg-subtle` | `#FAFAF9` | `#18181B` |
| `--color-bg-muted` | `#F4F4F2` | `#27272A` |
| `--color-border` | `#E7E5E4` | `#3F3F46` |
| `--color-border-strong` | `#D6D3D1` | `#52525B` |
| `--color-fg` | `#0C0A09` | `#FAFAF9` |
| `--color-fg-muted` | `#57534E` | `#A1A1AA` |
| `--color-fg-subtle` | `#78716C` | `#71717A` |

### Booking-status colors (domain-specific)

| Status | Color | Notes |
|---|---|---|
| `pending_payment` | `--color-warning-500` | Awaiting receipt upload |
| `payment_submitted` | `--color-info-500` | Awaiting venue verification |
| `confirmed` | `--color-success-500` | Verified, locked |
| `cancelled` | `--color-fg-subtle` | Within 15-min window |
| `no_show` | `--color-danger-500` | Player didn't arrive |
| `expired` | `--color-fg-subtle` | Hold timed out |

---

## 2. Typography

- **UI/Body:** `Inter` (system fallback)
- **Numerals (booking times, money):** `font-variant-numeric: tabular-nums`
- **Min size on mobile:** 14px
- **Max line length:** 65ch for body copy

### Scale (1.25 modular ratio)

| Token | Size | Line height | Weight |
|---|---|---|---|
| `text-xs` | 12px | 16px | 500 |
| `text-sm` | 14px | 20px | 500 |
| `text-base` | 16px | 24px | 400 |
| `text-lg` | 18px | 28px | 500 |
| `text-xl` | 20px | 28px | 600 |
| `text-2xl` | 24px | 32px | 700 |
| `text-3xl` | 30px | 36px | 700 |
| `text-4xl` | 36px | 44px | 800 |
| `text-5xl` | 48px | 56px | 800 |

---

## 3. Spacing (4px base)

`0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 96px`

---

## 4. Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Inputs, tags |
| `radius-md` | 10px | **Default** — buttons, cards |
| `radius-lg` | 14px | Modals |
| `radius-xl` | 20px | Hero panels |
| `radius-full` | 9999px | Pills, avatars |

---

## 5. Elevation

| Token | Box-shadow |
|---|---|
| `shadow-xs` | `0 1px 2px rgb(16 24 40 / 0.05)` |
| `shadow-sm` | `0 1px 3px rgb(16 24 40 / 0.10), 0 1px 2px rgb(16 24 40 / 0.06)` |
| `shadow-md` | `0 4px 8px -2px rgb(16 24 40 / 0.10), 0 2px 4px -2px rgb(16 24 40 / 0.06)` |
| `shadow-lg` | `0 12px 16px -4px rgb(16 24 40 / 0.08)` |

---

## 6. Motion

- `duration-fast` 150ms · `duration-base` 200ms · `duration-slow` 300ms
- `ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`
- Honor `prefers-reduced-motion: reduce` — opacity fades only

---

## 7. Breakpoints (mobile-first)

`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`

Design at **360px first** (common Filipino Android width).

---

## 8. Touch targets

- Minimum 44×44px · Comfortable 48×48px
- **Booking-action buttons: 56px** — must be effortless to tap on a phone at the court

---

## 9. Accessibility

- WCAG 2.2 AA contrast on all text
- Brand-500 on white: only valid for ≥18px or ≥14px bold; otherwise brand-700
- Focus rings: 2px solid brand-500 + 2px offset, never removed
- Form errors: color + icon + text label (never color-only)

---

## 10. Component variants

### Button
- Variants: `default` (brand) · `accent` (sunset) · `secondary` · `outline` · `ghost` · `destructive` · `link`
- Sizes: `sm 32` · `md 40` · `lg 48` · `xl 56` (primary booking CTA)

### Badge
- `success` · `warning` · `info` · `danger` · `neutral`

### Card
- Default: white bg, `radius-md`, `shadow-sm`, 24px padding
- Interactive (court listing): hover → `shadow-md` + `translateY(-2px)` on `lg+`

---

## 11. Iconography

- **Library:** `lucide-react`
- **Stroke:** 2px default, 1.5px for inline-text icons
- **Domain icons:** `Calendar` (bookings) · `MapPin` (venue) · `Receipt` (payment) · `Trophy` (rating) · `Users` (find partner) · `ShieldCheck` (verified venue)

---

## 12. Voice & copy

| Do | Don't |
|---|---|
| "Book this slot" | "Confirm reservation request" |
| "₱200 court fee + ₱20 system fee" | "Service charge applies" |
| "Cancel within 15 minutes for full refund" | "See terms for cancellation policy" |
| "Send ₱220 via GCash to 0917-xxx-xxxx" | "Complete payment processing" |

- Currency: `₱1,234.50` (en-PH locale)
- Times: 12-hour with AM/PM (`6:00 PM`)
- Dates: `Wed, Oct 15`
- Filipino-friendly placeholders: "e.g. Bayugan Sports Complex"

---

_Generated: Phase 0. Tokens applied in `apps/web/src/app/globals.css`._
