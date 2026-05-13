-- Migration 006: clamp generations_count to 3 for any FREE user that
-- has accumulated more than the free-tier limit.
--
-- Background: a bug in the generate route incremented generations_count
-- past the soft cap. The UI denied downloads correctly but the stored
-- value kept growing (6, 7, …). The route now hard-caps the value, but
-- existing rows need a one-time clamp so the user's account view reads
-- the expected "3 / 3" instead of "6 / 3".
--
-- We only touch rows where the user is *currently* on the free plan
-- (either plan='free' OR pro_until is null/expired). Pro users may
-- legitimately have generations_count > 3, so leave them alone.
--
-- Idempotent.

update public.profiles
set generations_count = 3
where generations_count > 3
  and (
    plan = 'free'
    or pro_until is null
    or pro_until < now()
  );
