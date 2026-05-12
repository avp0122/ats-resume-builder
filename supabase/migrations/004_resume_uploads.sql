-- Migration 004: per-upload log table.
-- One row per generation. Stores the personal info extracted from THIS
-- particular resume (a user can upload several resumes with different
-- contact details), plus the client OS for support / customization
-- routing. Idempotent.

create table if not exists public.resume_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  contact_email text,
  phone text,
  location text,
  date_of_birth date,
  social_links jsonb not null default '{}'::jsonb,
  client_os text,
  client_version text,
  original_score int,
  score int,
  created_at timestamptz not null default now()
);

create index if not exists resume_uploads_user_id_created_at_idx
  on public.resume_uploads (user_id, created_at desc);

alter table public.resume_uploads enable row level security;

drop policy if exists "read own uploads" on public.resume_uploads;
create policy "read own uploads" on public.resume_uploads
  for select using (auth.uid() = user_id);

drop policy if exists "insert own uploads" on public.resume_uploads;
create policy "insert own uploads" on public.resume_uploads
  for insert with check (auth.uid() = user_id);

-- Self-heal: allow signed-in users to insert their own profile row when
-- the auth signup trigger didn't fire (e.g., for accounts created before
-- migrations 001-003 were applied). Without this, generations_count
-- updates silently fail because the row doesn't exist and RLS prevents
-- creation from the user's session.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
