-- Migration 015: chat quota counters on profiles.
--
-- Per DECISION 031, signed-in free users get 50 chat messages per UTC
-- day; signed-in Pro/Staff are uncapped. Anonymous visitors are tracked
-- via a separate HMAC-signed cookie (`kairesume_chat_usage`, 5 msg/day)
-- — no DB row, same pattern as the existing anonymous generation quota.
--
-- Storing the reset timestamp instead of "messages today" lets us reset
-- lazily on read (`if (reset_at < now()) { count = 0; reset_at = next utc
-- midnight; }`). Avoids a scheduled job and works regardless of clock
-- skew between client and server.
--
-- Why nullable / default 0 + null:
--   Existing rows predate the chat feature. `chat_count_today` defaults
--   to 0 so reads work uniformly. `chat_reset_at` is nullable; null means
--   "never used the chat" and the first request initializes it. We
--   could backfill to 0 + UTC-tonight, but it's cheaper to do it lazily.

alter table public.profiles
  add column if not exists chat_count_today int not null default 0,
  add column if not exists chat_reset_at   timestamptz;
