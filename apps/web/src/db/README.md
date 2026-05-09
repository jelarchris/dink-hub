# DinkHub Data Model

> Source of truth: [`migrations/0001_init.sql`](./migrations/0001_init.sql)
> Drizzle reflectors: [`schema/index.ts`](./schema/index.ts)

## Entity overview

```
auth.users (Supabase)
   │
   └── profiles (1:1)
         ├── venues (owner)──── courts ──── bookings ──── payments
         │     │                  │            │
         │     └── venue_payouts  │            └── ledger_entries
         │                        │
         └── bookings (player)────┘
                                  │
                                  └── slot_holds (15-min reservation)
```

## Key invariants (enforced by DB, not app)

| Rule | Mechanism |
|---|---|
| **No double-booking on a court** | `EXCLUDE USING gist` on `(court_id, tstzrange(start_at, end_at))` |
| **No double slot-hold** | Same `EXCLUDE` on `slot_holds` (filtered to non-expired) |
| **30-min slot grain** | `CHECK extract(minute from start_at) % 30 = 0` |
| **Min 30-min, max 4-hour booking** | `CHECK end_at >= start_at + interval '30 min'` etc. |
| **Money never negative (or rare exception)** | `CHECK amount_centavos >= 0` per column |
| **PH phone format** | `CHECK phone_e164 ~ '^\+63[0-9]{10}$'` |
| **PH GCash mobile format** | `CHECK gcash_account_number ~ '^09[0-9]{9}$'` |
| **Idempotent payments** | `UNIQUE (booking_id, receipt_hash)` |
| **Idempotent ledger** | `UNIQUE idempotency_key` |
| **Default-deny security** | RLS on every table; explicit policies per role |
| **Optimistic concurrency** | `version` int + `bump_version()` trigger on writes |

## Lifecycle of a booking

```
[Player picks slot] ─► slot_holds row (15 min)
        │
        ├─[creates booking]─► bookings.status = pending_payment
        │                     cancellable_until = now() + 15 min
        │                     payment_due_at    = now() + 15 min
        │
        ├─[uploads receipt]─► payments.status   = submitted
        │                     bookings.status   = payment_submitted
        │
        ├─[venue verifies]──► payments.status   = verified
        │                     bookings.status   = confirmed
        │                     ledger_entries: 2 rows posted
        │                       (DEBIT venue_payable, CREDIT platform_revenue)
        │
        └─[Sunday cron]─────► venue_payouts row aggregated
                              (gross − fees → net for venue)
                              ledger_entries: 2 more rows posted on disbursement
```

## Cron jobs (to be wired in Phase 2)

| Job | Frequency | Action |
|---|---|---|
| `release_expired_holds` | every 60s | DELETE FROM `slot_holds` WHERE `expires_at < now()` |
| `expire_unpaid_bookings` | every 60s | UPDATE bookings SET status='expired' WHERE status='pending_payment' AND payment_due_at < now() |
| `aggregate_weekly_payouts` | Mon 00:00 PHT | INSERT INTO venue_payouts for previous week |

## Money rules

- **Storage:** `bigint` centavos (1 PHP = 100 centavos)
- **Display:** `formatPHP()` in [`@/lib/money`](../lib/money.ts) → `₱1,234.50`
- **Arithmetic:** always integer math on bigints; never `numeric`, never `float`
- **System fee snapshot:** `bookings.system_fee_centavos` is captured at booking creation
  from `current_system_fee_centavos()` so historical bookings keep their fee

## Permissions matrix (RLS)

| Resource | Public/Anon | Authenticated player | Venue owner | Admin |
|---|---|---|---|---|
| `profiles` | – | read all (non-deleted) · write own | read all · write own | full |
| `venues` | read active only | read active · read own | read/write own | full |
| `courts` | read (active venues) | read | read/write own venue's | full |
| `bookings` | – | read/write own | read/update venue's | full |
| `payments` | – | read/insert own | read/update venue's | full |
| `slot_holds` | – | read/write own | – | full |
| `venue_payouts` | – | – | read own venue's | full |
| `ledger_entries` | – | – | – | read |
| `system_fee_settings` | – | read | read | read/insert |
| `admin_users` | – | – | – | full |

## What's NOT yet in the schema (future phases)

- Reviews/ratings on venues
- Match recording for Glicko-2 player ratings
- Find-a-partner posts
- Recurring bookings
- Tournament brackets
- Notification preferences
