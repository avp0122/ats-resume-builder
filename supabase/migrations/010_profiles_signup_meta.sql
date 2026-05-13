-- Migration 010: capture signup-time identity + client metadata on profiles.
--
-- Profiles now carries:
--   email                   — duplicated from auth.users.email so queries
--                              can stay within public.* (auth.users needs
--                              service_role to read)
--   signup_os               — OS parsed from the signup request's
--                              User-Agent (e.g. "Windows", "macOS",
--                              "iOS", "Android", "Linux")
--   signup_browser          — Browser family ("Chrome", "Firefox",
--                              "Safari", "Edge", "Opera")
--   signup_browser_version  — major.minor string from the UA
--   signup_country          — geo-IP country name (best-effort)
--   signup_city             — geo-IP city (best-effort)
--   signup_ip               — IP recorded at signup (from
--                              x-forwarded-for / x-real-ip)
--
-- Email is filled by the auto-create trigger so it's never null on new
-- rows; the client metadata is filled by /api/auth/signup after the
-- session client returns. All client metadata is best-effort and may be
-- null when the UA is missing or the geo-IP lookup times out.
--
-- Idempotent.

alter table public.profiles
  add column if not exists email text,
  add column if not exists signup_os text,
  add column if not exists signup_browser text,
  add column if not exists signup_browser_version text,
  add column if not exists signup_country text,
  add column if not exists signup_city text,
  add column if not exists signup_ip text;

-- Email is the most-queried new field (support lookups, admin "find this
-- user" flows). Lowercase index for case-insensitive matches.
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- One-shot backfill: copy email from auth.users into existing profile
-- rows that don't have it yet. Safe to re-run.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Update the auto-create trigger so new signups get the email field
-- populated in the same transaction as the auth.users insert. The client
-- metadata still has to be filled from the request, so the API route
-- does an UPDATE after auth.signUp returns.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
