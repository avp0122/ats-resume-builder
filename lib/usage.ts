import { createHmac, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'kairesume_usage';
const ANON_FREE_LIMIT = 1; // generations before signin is required to download
export const SIGNED_IN_FREE_LIMIT = 3; // generations per period for signed-in free users

function getSecret(): string {
  return process.env.USAGE_COOKIE_SECRET || 'dev-only-secret-replace-in-production';
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32);
}

function encode(count: number): string {
  const payload = `${count}.${Date.now()}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split('.');
  if (parts.length !== 3) return 0;
  const [countStr, ts, sig] = parts;
  if (sign(`${countStr}.${ts}`) !== sig) return 0;
  const n = parseInt(countStr, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function readAnonCount(): number {
  const c = cookies().get(COOKIE_NAME)?.value;
  return decode(c);
}

export function bumpAnonCount(): number {
  const current = readAnonCount();
  const next = current + 1;
  cookies().set(COOKIE_NAME, encode(next), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return next;
}

export function anonDownloadAllowed(count: number): boolean {
  return count <= ANON_FREE_LIMIT;
}

export const FREE_LIMIT = ANON_FREE_LIMIT;
