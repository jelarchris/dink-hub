---
applyTo: "apps/web/src/features/**"
---

# DinkHub — Feature module rules

## Layering
```
features/<feature>/
  service.ts      ← business logic, "server-only"
  repo.ts         ← Drizzle queries, "server-only"
  schema.ts       ← Zod schemas (boundary validation)
  actions.ts      ← "use server" — Server Actions, calls service
  components/     ← UI (server + client)
  index.ts        ← public barrel
```
- `"server-only"` at the top of every server file.
- Cross-feature imports go through `index.ts`. Inside the feature, import internal files directly.
- Wrap singleton/per-request reads in `import { cache } from "react"`.

## Critical: client → server action imports
Client components (`"use client"`) MUST import server actions **directly** from `@/features/<f>/actions`, never from the feature barrel. The barrel transitively pulls the Drizzle/Postgres client and Webpack fails with `Can't resolve 'tls'`.

```ts
// ✅ in a client component
import { updateSystemSettingsAction } from "@/features/system-settings/actions";
// ❌ in a client component
import { updateSystemSettingsAction } from "@/features/system-settings";
```

## Server Actions
- Always validate via Zod (`schema.parse(input)`).
- Always re-check authorization at the action level (`requireAdmin()`, owner ownership via `venues.owner_id = auth.uid()`).
- Rate-limit auth/booking/receipt/invoice mutations (`@/lib/rate-limit`).
- Verify Turnstile on user-initiated mutations.
- Wrap privileged mutations with `recordAudit({ actor, action, targetType, targetId, before, after, reason })`.
- Return `ActionResult` shape: `{ ok: true; data } | { ok: false; code; message; fieldErrors? }`.

## Repo / DB
- Idempotent inserts: `.onConflictDoNothing({ target: [...] })` returns `[]` on conflict — re-SELECT to get the existing row.
- Optimistic concurrency: `UPDATE ... WHERE version = $expected RETURNING *`. Throw on empty result.
- Money is `bigint` centavos. Booking status `confirmed` is the only state that owes a fee.

## Don'ts
- No `any`. Use `unknown` + Zod parse at boundaries.
- No `useEffect` for data fetching — Server Components or Server Actions only.
- No `@/lib/logger` — module doesn't exist. Use `console.info` sparingly or `captureException` from `@/lib/observability`.
- No `Date.now()` for booking math — use `timestamptz` from DB.
