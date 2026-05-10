---
applyTo: "apps/web/src/app/api/cron/**"
---

# DinkHub — Cron route rules

Vercel Hobby caps cron jobs at once-per-day, so all sub-daily and most weekly crons are driven by **GitHub Actions** hitting our route with `Authorization: Bearer ${CRON_SECRET}`.

## Route shape (mirror `/api/cron/expire/route.ts`)
- `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"`.
- `isAuthorized(req)` checks `Authorization: Bearer ${env.CRON_SECRET}` AND falls back to Vercel's `x-vercel-cron` + `x-cron-secret` pair.
- 401 on unauthorized. 500 + `captureException(err, { scope: "cron.<name>" })` on errors. Always return JSON.
- Operations must be **idempotent** — relies on DB UNIQUE constraints, not on the cron firing only once.
- `export const POST = GET` (or vice versa) so manual `curl -X POST` works for emergencies.

## Pair every route with a workflow
Create `.github/workflows/cron-<name>.yml` mirroring `cron-expire.yml`:
- `schedule.cron` in UTC. Manila is fixed UTC+8 → 06:00 Manila = `0 22 * * <prev-day>`.
- `concurrency.group: cron-<name>` with `cancel-in-progress: false`.
- `curl -sS -X POST "$base/api/cron/<name>" -H "Authorization: Bearer $CRON_SECRET" --max-time 120 --retry 2`.
- Required repo secret: `CRON_SECRET` (mirror of Vercel env). Optional `CRON_TARGET_URL` (defaults to `https://dinkhub.ph`).

## Time math
- Asia/Manila is fixed UTC+8 (no DST). Safe to add/subtract `8 * 3_600_000` ms when computing wall-clock periods.
- Persist UTC `timestamptz`. Format to Manila only at the UI boundary.
