-- Migration 012: profiles holds the user's primary resume.
--
-- Per DECISION 024: signed-in users have a single stored resume on
-- their profile. They upload it once via /account, replace it when
-- they want to update, and per-generation only paste the JD. The
-- extracted text is stored directly (no Supabase Storage round-trip)
-- so subsequent generations skip PDF parsing entirely.
--
-- We do NOT store the original binary file. Per kairesume's privacy
-- stance, only the extracted text is persisted. The original PDF/DOCX
-- is dropped after extraction at /api/profile/resume. The user can
-- clear all stored text via DELETE /api/profile/resume.
--
-- Idempotent — safe to re-run.

alter table public.profiles
  add column if not exists resume_text text,
  add column if not exists resume_filename text,
  add column if not exists resume_uploaded_at timestamptz;

comment on column public.profiles.resume_text is
  'Extracted plain text of the user''s stored resume. Used by /api/generate when no per-request resume is uploaded. Cleared by DELETE /api/profile/resume.';
comment on column public.profiles.resume_filename is
  'Original filename of the uploaded resume — display-only for the /account page.';
comment on column public.profiles.resume_uploaded_at is
  'Timestamp of the most recent upload — display-only for the /account page.';
