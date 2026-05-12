-- Migration 002: store extracted personal info on profiles.
-- Idempotent — safe to re-run.

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists location text,
  add column if not exists date_of_birth date,
  add column if not exists social_links jsonb not null default '{}'::jsonb;

-- Index by full name for future search/admin needs.
create index if not exists profiles_full_name_idx on public.profiles (lower(full_name));
