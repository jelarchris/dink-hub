-- 0029_gcash_sender_mobile.sql
-- Adds gcash_sender_mobile to both payments and open_play_signup_payments so
-- owners can see which GCash number the payment came from during verification.

-- Idempotent: safe to re-apply.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gcash_sender_mobile text;

ALTER TABLE open_play_signup_payments
  ADD COLUMN IF NOT EXISTS gcash_sender_mobile text;
