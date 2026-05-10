# E2E (Playwright)

Catch-fire harness for Next 16 + Supabase. Anonymous-only specs land here today;
authenticated flows are tracked as **Phase 2.10b**.

## Run

```pwsh
cd apps/web
pnpm test:e2e        # headless
pnpm test:e2e:ui     # Playwright UI runner
```

The runner reuses an already-running `pnpm dev` on port 3000 (Next 16 enforces
single-instance dev servers per repo). Set `E2E_PORT` to spawn a different one.

`global-setup.ts` seeds a deterministic world (admin/owner/player profiles +
one venue + one court + a known system fee) directly via SQL. `global-teardown`
removes everything by deterministic email. Set `E2E_KEEP=1` to skip teardown
when debugging.

## Phase 2.10b — authenticated specs (deferred)

The Supabase project uses the new `sb_secret_*` API key format, which is
incompatible with both the legacy GoTrue admin endpoints (`auth.admin.*`) and
direct-insert sign-in (GoTrue returns `Database error querying schema` when
asked to issue a token for a row it didn't create itself, even with all
columns mirrored from a known-good user + a matching `auth.identities` row).

To unblock player/owner/admin specs, pick one:

1. **Add a legacy JWT service-role key** to `.env.test.local` under a separate
   var like `SUPABASE_LEGACY_SERVICE_ROLE_KEY`, and swap `seed.ts` to use
   `auth.admin.createUser({ email, password, email_confirm: true })`.
2. **Add a test-only signin route** `app/api/__test__/signin/route.ts`
   guarded by `process.env.E2E_TEST_SECRET`, which mints a session cookie
   using the same Supabase SSR client the real signin action uses.

Once either is in place, restore the `player-booking.spec.ts` and
`admin-dispute.spec.ts` files (their last working versions are in git history
on the Phase 2.10 commit).
