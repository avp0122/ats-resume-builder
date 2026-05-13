-- Migration 008: profiles holds USER info only, not info derived from
-- uploaded resumes.
--
-- Background: migration 002 added full_name / contact_email / phone /
-- location / date_of_birth / social_links to profiles, and the generate
-- route backfilled them from the most recent uploaded resume. That's
-- conceptually wrong — those fields describe a *specific resume*, not the
-- account. Each uploaded resume already stores its own copy in
-- public.resume_uploads (added in migration 004), which is the correct
-- home for them.
--
-- This migration drops the columns from profiles. The right column to
-- query for "what name was on the most recent resume?" is
-- resume_uploads.full_name (etc.), filtered by user_id, ordered by
-- created_at desc.
--
-- For now profiles intentionally exposes only what we actually know about
-- the *user* (email lives in auth.users.email) plus plan/billing state
-- and the generations counter.
--
-- Idempotent.

-- Drop the per-resume contact-info index first so we don't leave a
-- dangling reference to a column that's about to vanish.
drop index if exists profiles_full_name_idx;

alter table public.profiles
  drop column if exists full_name,
  drop column if exists contact_email,
  drop column if exists phone,
  drop column if exists location,
  drop column if exists date_of_birth,
  drop column if exists social_links;
