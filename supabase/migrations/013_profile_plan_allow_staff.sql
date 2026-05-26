-- Migration 013: allow 'staff' as a valid value on profiles.plan.
--
-- Per DECISION 021 we added a third stored plan value, 'staff', that
-- maps to effective Pro unconditionally (no pro_until check). The
-- original DECISION 021 incorrectly assumed the `plan` column had no
-- CHECK constraint — in fact a constraint `profiles_plan_check`
-- restricts the column to ('free', 'pro') and rejected the SQL update
-- the first time it was attempted in production:
--
--   ERROR: 23514: new row for relation "profiles" violates check
--   constraint "profiles_plan_check"
--
-- The constraint was added at table creation, before this repo's
-- tracked migrations (which start at 002). DECISION 026 documents the
-- amendment; this migration codifies the fix so any future fresh DB
-- (staging, a fork, a migrated project) gets the correct constraint
-- automatically.
--
-- Strategy: drop the old constraint and recreate it including 'staff'.
-- Idempotent — `drop constraint if exists` + a uniquely-named new
-- constraint is safe to re-run.

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro', 'staff'));
