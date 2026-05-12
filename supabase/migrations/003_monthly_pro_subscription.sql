-- Migration 003: monthly Pro subscription support.
-- Stores when the current Pro period ends so we can check pro_until > now()
-- in the application layer. Idempotent.

alter table public.profiles
  add column if not exists pro_until timestamptz;

create index if not exists profiles_pro_until_idx on public.profiles (pro_until);
