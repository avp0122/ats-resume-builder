import { createHmac } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Anonymous chat quota — daily, cookie-backed (DECISION 031).
 *
 * Mirrors lib/usage.ts (signed HMAC cookie, same secret so one rotation
 * invalidates both), but the counter resets every UTC day instead of being
 * a lifetime tally. We store `count.utcDay.signature`; on read, if the
 * stored day isn't today we treat the count as 0 (lazy reset — no job).
 *
 * Signed-in users don't use this; their counter lives on profiles
 * (chat_count_today / chat_reset_at) and is handled in lib/rag/chatQuota.ts.
 */

const COOKIE_NAME = 'kairesume_chat_usage';
const MS_PER_DAY = 86_400_000;

function getSecret(): string {
  return process.env.USAGE_COOKIE_SECRET || 'dev-only-secret-replace-in-production';
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32);
}

function utcDay(now = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

function decode(value: string | undefined): { count: number; day: number } {
  const today = utcDay();
  if (!value) return { count: 0, day: today };
  const parts = value.split('.');
  if (parts.length !== 3) return { count: 0, day: today };
  const [countStr, dayStr, sig] = parts;
  if (sign(`${countStr}.${dayStr}`) !== sig) return { count: 0, day: today };
  const count = parseInt(countStr, 10);
  const day = parseInt(dayStr, 10);
  if (!Number.isFinite(count) || !Number.isFinite(day) || count < 0) {
    return { count: 0, day: today };
  }
  return { count, day };
}

/** Today's anonymous chat-message count (0 if the cookie is from a past day). */
export function readAnonChatCount(): number {
  const { count, day } = decode(cookies().get(COOKIE_NAME)?.value);
  return day === utcDay() ? count : 0;
}

/** Increment and persist today's anonymous chat count; returns the new value. */
export function bumpAnonChatCount(): number {
  const today = utcDay();
  const next = readAnonChatCount() + 1;
  const payload = `${next}.${today}`;
  cookies().set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 2 days is enough to carry a cookie across one UTC boundary; the day
    // stamp inside handles the actual reset.
    maxAge: 60 * 60 * 24 * 2,
  });
  return next;
}
