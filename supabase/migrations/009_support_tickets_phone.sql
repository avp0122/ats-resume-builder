-- Migration 009: support tickets now collect a phone number too.
--
-- The on-site Support popup asks for title + email + phone + message.
-- Phone is optional (visitors may not want to share one). Idempotent.

alter table public.support_tickets
  add column if not exists phone text;
