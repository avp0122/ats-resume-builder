-- Kresume Supabase schema. Paste into SQL editor of your Supabase project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  generations_count int not null default 0,
  full_name text,
  contact_email text,
  phone text,
  location text,
  date_of_birth date,
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- For existing installs, see supabase/migrations/002_personal_info.sql.
create index if not exists profiles_full_name_idx on public.profiles (lower(full_name));

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

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments
  for select using (auth.uid() = user_id);

-- Auto-create profile on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
