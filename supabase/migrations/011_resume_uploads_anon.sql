-- Migration 011: anonymous resume uploads.
--
-- Before this, public.resume_uploads.user_id was NOT NULL with an FK
-- to auth.users(id), so anonymous visitors had nothing in the table —
-- the /api/generate route skipped the insert entirely when no userId
-- was present.
--
-- We now want to keep a row per anonymous generation too, keyed by a
-- visitor-side signed cookie (the `kairesume_anon_id` value managed by
-- lib/anonId.ts). When the visitor later signs up, the signup route
-- runs an UPDATE that swaps anon_id for user_id, so the new account
-- inherits its pre-signup history.
--
-- Invariants:
--   - exactly one of (user_id, anon_id) is set
--   - signed-in rows still SELECT/INSERT under the existing RLS
--     policies (which check auth.uid() = user_id)
--   - anonymous rows are written ONLY via the admin (service-role)
--     client because the user_id-based RLS would otherwise reject
--     them. There's no SELECT path for anon rows by design — the
--     home page doesn't read history pre-signup.
--
-- Idempotent.

-- 1. Allow user_id to be null, then add the anonymous identifier.
alter table public.resume_uploads
  alter column user_id drop not null,
  add column if not exists anon_id text;

-- 2. Enforce "exactly one of user_id / anon_id is set" so a future code
--    bug can't silently insert orphan rows. We DROP-then-ADD so the
--    constraint is replaced when this migration is re-run with a
--    tightened spec.
alter table public.resume_uploads
  drop constraint if exists resume_uploads_owner_set;
alter table public.resume_uploads
  add constraint resume_uploads_owner_set
  check (
    (user_id is not null and anon_id is null) or
    (user_id is null and anon_id is not null)
  );

-- 3. Index anon_id for the claim-on-signup query
--    `UPDATE … WHERE anon_id = $1`. The user-id index already covers
--    the signed-in read path.
create index if not exists resume_uploads_anon_id_idx
  on public.resume_uploads (anon_id)
  where anon_id is not null;
