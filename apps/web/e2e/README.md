# E2E (Playwright)

Catch-fire harness for Next 16 + Supabase. Covers public catalog smoke flows
and authenticated player / owner / admin shells.

## Run

```pwsh
cd apps/web
pnpm test:e2e        # headless
pnpm test:e2e:ui     # Playwright UI runner
```

The runner reuses an already-running `pnpm dev` on port 3000 (Next 16 enforces
single-instance dev servers per repo). Set `E2E_PORT` to spawn a different one.

## Seeded world

`global-setup.ts` seeds a deterministic world directly via SQL:

- `e2e-admin@dinkhub.test` — admin profile
- `e2e-owner@dinkhub.test` — venue owner + one venue (`e2e-bayugan-courts`) + one court
- `e2e-player@dinkhub.test` — player profile
- A current `system_fee_settings` row

All three personas share the password constant `E2E_PASSWORD` exported from
`e2e/support/seed.ts`. `global-teardown` removes everything by deterministic
email. Set `E2E_KEEP=1` to skip teardown when debugging.

## Authenticated specs

We avoid the Supabase Admin API (the project uses `sb_secret_*` keys, which the
legacy admin endpoints reject) by signing in over a test-only Route Handler:

- `src/app/api/test/signin/route.ts` — gated by **all** of:
  - `NODE_ENV !== "production"`
  - `NEXT_PUBLIC_APP_ENV !== "production"`
  - request header `x-e2e-token` matching `env.E2E_TEST_TOKEN`
  - body `{ email, password }` Zod-validated and passed to
    `supabase.auth.signInWithPassword`
- Any guard miss returns `404`; never enabled in production builds.

`global-setup.ts` calls `signInAndPersist(role, baseURL)` for each persona,
which POSTs to that route with a Playwright `APIRequestContext` and writes
`e2e/.auth/<role>.json` storage state. Specs opt in via:

```ts
import { STORAGE_STATE } from "../support/auth";
test.use({ storageState: STORAGE_STATE.player });
```

`e2e/.auth/` is git-ignored.

### Setup

Add to `apps/web/.env.local`:

```env
E2E_TEST_TOKEN=<32+ char random hex>
```

Generate one with `openssl rand -hex 32` or:

```pwsh
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

If `E2E_TEST_TOKEN` is unset, `global-setup` skips the signin step and
authenticated specs will fail with a "missing storage state" error — anonymous
specs still pass.

### Why the seed inserts empty-string tokens

GoTrue scans `confirmation_token`, `recovery_token`, `email_change_token_new`,
and `email_change` into Go non-nullable strings. Inserting `NULL` for any of
those columns triggers a 500 "Database error querying schema" on the next
sign-in attempt, even though the row otherwise looks valid. `seed.ts` writes
empty strings for all four; do not regress this.
