-- Migration 007: customer support feedback.
--
-- A simple "leave a note for support" surface — free for any visitor
-- (anonymous or signed in). Rows are insert-only for users; reads are
-- service-role only (so the inbox is private).
--
-- Idempotent.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  client_ip text,
  client_ua text,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);
create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id);
create index if not exists support_tickets_status_idx
  on public.support_tickets (status);

alter table public.support_tickets enable row level security;

-- Anonymous + authenticated users may submit a ticket. The "user_id IS
-- NULL OR user_id = auth.uid()" check stops a signed-in user from
-- spoofing a ticket as another user.
drop policy if exists "insert support ticket" on public.support_tickets;
create policy "insert support ticket" on public.support_tickets
  for insert
  with check (user_id is null or user_id = auth.uid());

-- Users may read back their own tickets (so an in-app history view can
-- show them later). The service-role key bypasses RLS for admin reads.
drop policy if exists "read own support tickets" on public.support_tickets;
create policy "read own support tickets" on public.support_tickets
  for select using (user_id = auth.uid());
