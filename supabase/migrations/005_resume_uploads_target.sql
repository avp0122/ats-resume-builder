-- Migration 005: store the JD's target role + company on each upload row.
-- Used for the downloaded ZIP filename so users who run multiple
-- generations against different jobs can tell them apart at a glance.
-- Idempotent.

alter table public.resume_uploads
  add column if not exists target_role text,
  add column if not exists target_company text;
