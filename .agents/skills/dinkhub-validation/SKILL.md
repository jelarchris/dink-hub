---
name: dinkhub-validation
description: Run the DinkHub pre-commit validation gate (typecheck → lint → next build) and optionally apply a migration and deploy. Use after any non-trivial change to apps/web before committing.
---

# dinkhub-validation

The canonical pipeline for verifying a change is safe to commit and deploy.

## Standard gate (run before every commit)
```powershell
cd z:\dink-hub\apps\web
pnpm exec tsc --noEmit; if ($LASTEXITCODE -ne 0) { throw "tsc failed" }
pnpm exec eslint . --max-warnings 0; if ($LASTEXITCODE -ne 0) { throw "eslint failed" }
pnpm exec next build; if ($LASTEXITCODE -ne 0) { throw "next build failed" }
```
All three must exit 0. Husky pre-commit re-runs lint + typecheck.

## When a migration is included
Apply it before `next build` so the schema and code match:
```powershell
cd z:\dink-hub\apps\web
pnpm migrate-run src/db/migrations/<file>.sql
```
There is ONE Supabase project (`uffuyavfpvoendvpvypy`) — it powers production `dinkhub.ph`. No separate prod DB.

## Deploy (after gate passes)
```powershell
cd z:\dink-hub
git add -A
git commit -m "<conventional-commit>"
git push origin main
vercel --prod --yes
```
`dinkhub.ph` is auto-aliased to the new deployment.

## Gotchas to check first
- Did you import a server action from a feature **barrel** in a `'use client'` file? Webpack will fail with `Can't resolve 'tls'`. Import from `@/features/<f>/actions` directly.
- Did you forget `prop?: T | undefined` on optional component props? `exactOptionalPropertyTypes: true` will reject `prop: undefined`.
- Did you call a Drizzle generated column on insert? Remove it from the values object.
- Did you use `formatPHP(number)` instead of `formatPHP(bigint)`? Money is centavos `bigint`.
- Did you display a date without `timeZone: "Asia/Manila"`? Fix the Intl formatter.
