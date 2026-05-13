import { createHmac, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Stable per-visitor identifier for anonymous resume uploads.
 *
 * Lifecycle:
 *   1. First anonymous generation → ensureAnonId() mints a random
 *      32-char hex id and stores it in a signed HTTP-only cookie.
 *   2. Subsequent generations from the same browser reuse the id,
 *      so a visitor's pre-signup history sits under one key in
 *      public.resume_uploads.
 *   3. On signup, the signup route reads the id, runs
 *      UPDATE resume_uploads SET user_id = $new WHERE anon_id = $id,
 *      and clears the cookie so the now-claimed rows aren't double-
 *      attributed if the user signs out and uses anon again.
 *
 * Mirrors the cookie format used by lib/usage.ts (value.signature) and
 * reuses the same secret so a single rotation invalidates both.
 */

const COOKIE_NAME = 'kairesume_anon_id';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

function getSecret(): string {
  return process.env.USAGE_COOKIE_SECRET || 'dev-only-secret-replace-in-production';
}

function sign(payload: string): string {
  // 128 bits of HMAC-SHA256 truncation. Enough to make forging
  // infeasible without the secret; same length lib/usage.ts uses.
  return createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32);
}

function encode(value: string): string {
  return `${value}.${sign(value)}`;
}

function decode(raw: string | undefined): string | null {
  if (!raw) return null;
  // Cookie shape is `<id>.<sig>`. Id is opaque hex from randomBytes so
  // it can't contain '.', but we still split on the LAST '.' to be safe
  // against future format changes.
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return null;
  const value = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (sign(value) !== sig) return null;
  // Whitelist: only accept the exact 32-hex format we mint. Any other
  // string indicates either an outdated format or tampering; treat it
  // as no-id.
  if (!/^[0-9a-f]{32}$/.test(value)) return null;
  return value;
}

/**
 * Read the existing anon id from the cookie jar, or `null` if missing /
 * tampered / outdated.
 */
export function readAnonId(): string | null {
  return decode(cookies().get(COOKIE_NAME)?.value);
}

/**
 * Return the current anon id, minting one if the cookie is absent.
 * Called from /api/generate before inserting an anonymous resume row.
 */
export function ensureAnonId(): string {
  const existing = readAnonId();
  if (existing) return existing;
  const fresh = randomBytes(16).toString('hex'); // 32-char hex
  cookies().set(COOKIE_NAME, encode(fresh), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_S,
  });
  return fresh;
}

/**
 * Drop the anon id cookie. Called from /api/auth/signup after the new
 * user's pre-existing anon rows have been claimed, so a subsequent
 * sign-out → anonymous-use round-trip starts fresh.
 */
export function clearAnonId(): void {
  cookies().delete(COOKIE_NAME);
}
