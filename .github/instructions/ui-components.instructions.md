---
applyTo: "apps/web/src/{app,components,features}/**/*.{tsx,ts}"
---

# DinkHub — UI rules

## Layout
- Primary CTA above the fold. Sticky bottom CTA on mobile for one-action pages.
- Avoid wrapping every section in `Card/CardHeader/CardContent`. Use thin dividers + uppercase tracking-wide kicker labels.
- Tight spacing: `mt-3/mt-4`, not `mt-8`. Container: `<Container className="py-3 sm:py-4">` with `max-w-3xl|4xl` on focused pages.
- Hero heights: `h-44 sm:h-60`.
- Details rows: `<dl className="grid grid-cols-[auto_1fr]">`, never Cards.

## Status / balance card pattern (Phase 2)
- Tone shells: `promo` (gradient brand-50→white), `due` (orange-50), `submitted` (sky-50), `rejected` (red-50), `clear` (neutral border).
- Big amount with `tabular-nums`, 11px uppercase kicker, mobile-stacked CTA + desktop inline CTA.
- Date display: ALWAYS `new Intl.DateTimeFormat("en-PH", { ..., timeZone: "Asia/Manila" })`. Never bare `toLocaleDateString`.
- Date columns return `YYYY-MM-DD` strings — parse with `new Date(\`${value}T00:00:00+08:00\`)`.

## Components (canonical paths)
- `cn` from `@/lib/cn` (NOT `@/lib/utils`).
- `formatPHP(centavos: bigint)` from `@/lib/money`.
- `Badge` variants: `success | warning | info | danger | neutral`. Map domain statuses to these — there are no `success-100/700` or `danger-700` Tailwind tokens.
- `<SubmitButton>` (uses `useFormStatus`) on every Server Action form.
- `<ImageUpload aspect="square|video|card" name existingPathName? removeFlagName?>`.
- `<CopyButton value label? size?>`.
- No `Button asChild`. Use `<Link className={buttonVariants({ size, variant })}>`.

## Tailwind tokens (CSS vars)
- Brand: `--color-brand-50/100/300/500/600/700/900`.
- Accent: `--color-accent-500/600`.
- Surfaces: `--color-bg`, `--color-bg-muted`, `--color-fg`, `--color-fg-muted`, `--color-border-default`.
- Radii: `--radius-md`, `--radius-lg`. Shadow: `--shadow-sm`.
- Use Tailwind palette directly (`orange-50`, `sky-50`, `red-50`) for tone shells — they're approved.

## TypeScript
- `exactOptionalPropertyTypes: true` — optional props passed possibly-undefined values must be typed `prop?: T | undefined`.
- `noUncheckedIndexedAccess: true` — array index access returns `T | undefined`; narrow before use.
