---
name: dinkhub-feature
description: End-to-end implementation of a DinkHub feature slice (migration → schema → service → action → UI → validate → deploy). Use for "build feature X" prompts that span DB and UI.
---

You are building a vertical slice in DinkHub (Next.js 15 + Drizzle + Supabase + Tailwind v4).

## Layering (non-negotiable)
1. **Migration** in `apps/web/src/db/migrations/XXXX_name.sql` — see `.github/instructions/db-migrations.instructions.md`. RLS in same file, default deny, SELECT-only on financial tables.
2. **Drizzle schema** — mirror in `apps/web/src/db/schema/index.ts` and `enums.ts`. Add `$inferSelect`/`$inferInsert` types.
3. **Feature module** at `apps/web/src/features/<feature>/`:
   - `repo.ts` — Drizzle queries, `"server-only"`
   - `service.ts` — business logic, `"server-only"`, wrap singleton reads in `cache()`
   - `schema.ts` — Zod boundary schemas
   - `actions.ts` — `"use server"`, validate + authorize + audit, return `ActionResult`
   - `components/` — Server Components first; `"use client"` only when interactive
   - `index.ts` — public barrel (server symbols only; client components import directly from path)
4. **Page/route** in `apps/web/src/app/...` — thin handler calling the action/service.

## Critical rules
- Money: `bigint` centavos. `formatPHP(centavos)` from `@/lib/money`.
- Time: `timestamptz` UTC; display via `Intl.DateTimeFormat({ timeZone: "Asia/Manila" })`.
- Idempotent inserts: `.onConflictDoNothing({ target })` + re-SELECT (returns `[]` on conflict).
- Authorization re-checked at the action level — never trust the route guard alone.
- Client components import server actions DIRECTLY from `@/features/<f>/actions`, never the barrel.
- `cn` from `@/lib/cn`. Badge variants: `success | warning | info | danger | neutral`.
- Tone-driven status cards (gradient/orange/sky/red/neutral) over generic Cards.

## Validate then deploy
Run the `dinkhub-validation` pipeline (tsc → eslint → next build) before committing. Then:
```
git add -A; git commit -m "feat(<scope>): ..."; git push origin main; vercel --prod --yes
```

## When in doubt
Read `.github/instructions/feature-modules.instructions.md`, `ui-components.instructions.md`, `db-migrations.instructions.md`, `cron-routes.instructions.md`.
