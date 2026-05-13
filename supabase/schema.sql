-- Kresume Supabase schema. Paste into SQL editor of your Supabase project.

create extension if not exists "pgcrypto";

-- profiles holds USER-level state only. Anything that describes a
-- specific uploaded resume (name, phone, location, social links, etc.)
-- lives on public.resume_uploads — there can be many uploads per user,
-- each with their own contact block. See migration 008 for the history.
--
-- Signup-time client metadata (email, OS, browser + version, geo-IP
-- country/city, IP) is captured here too — see migration 010.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  pro_until timestamptz,
  generations_count int not null default 0,
  email text,
  signup_os text,
  signup_browser text,
  signup_browser_version text,
  signup_country text,
  signup_city text,
  signup_ip text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_pro_until_idx on public.profiles (pro_until);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- resume_uploads stores one row per generation. user_id is nullable so
-- anonymous visitors can be tracked via anon_id (a signed cookie) and
-- their rows are claimed on signup by swapping anon_id → user_id.
-- See migration 011 for the constraint history.
create table if not exists public.resume_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text,
  full_name text,
  contact_email text,
  phone text,
  location text,
  date_of_birth date,
  social_links jsonb not null default '{}'::jsonb,
  target_role text,
  target_company text,
  client_os text,
  client_version text,
  original_score int,
  score int,
  created_at timestamptz not null default now(),
  constraint resume_uploads_owner_set check (
    (user_id is not null and anon_id is null) or
    (user_id is null and anon_id is not null)
  )
);

create index if not exists resume_uploads_user_id_created_at_idx
  on public.resume_uploads (user_id, created_at desc);
create index if not exists resume_uploads_anon_id_idx
  on public.resume_uploads (anon_id)
  where anon_id is not null;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_hash text not null unique,
  chain text not null,
  amount numeric not null,
  currency text not null,
  plan_purchased text not null,
  status text not null default 'verified',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.resume_uploads enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments
  for select using (auth.uid() = user_id);

drop policy if exists "read own uploads" on public.resume_uploads;
create policy "read own uploads" on public.resume_uploads
  for select using (auth.uid() = user_id);

drop policy if exists "insert own uploads" on public.resume_uploads;
create policy "insert own uploads" on public.resume_uploads
  for insert with check (auth.uid() = user_id);

-- Auto-create profile on signup. Email is copied from auth.users in the
-- same transaction; the rest of the signup-time client metadata
-- (OS/browser/location) is filled in by the /api/auth/signup route once
-- it sees the request headers.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
