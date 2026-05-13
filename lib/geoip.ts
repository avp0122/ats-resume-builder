/**
 * Best-effort geo-IP lookup. Server-side only.
 *
 * Provider: ipapi.co — free tier is 1000 lookups/day with no API key,
 * supports HTTPS, returns JSON. We don't pay for higher tiers because
 * signup is the only place we call it.
 *
 * Everything here is wrapped in best-effort error handling: if the
 * lookup fails, times out, or returns malformed data, we return nulls
 * so the caller can still save the row. No exception ever propagates
 * out of `lookupGeoIp` — geo-IP is decorative analytics, not a signup
 * gate.
 */

export interface GeoIpResult {
  country: string | null;
  city: string | null;
}

const EMPTY: GeoIpResult = { country: null, city: null };

// Private / loopback / link-local ranges — ipapi.co will return an error
// or empty for these, so short-circuit. Avoids a wasted external call
// every time a developer signs up against localhost.
function isLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === 'unknown') return true;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('169.254.')) return true; // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique-local IPv6
  if (ip.startsWith('fe80:')) return true; // link-local IPv6
  return false;
}

export async function lookupGeoIp(ip: string): Promise<GeoIpResult> {
  if (isLocalIp(ip)) return EMPTY;

  // 2 second budget — signup must not block on geo-IP. ipapi.co usually
  // responds in 200-400ms; anything longer and we'd rather show "no
  // location" than make the user wait.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'kairesume-signup/1.0 (geo-ip lookup)' },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as {
      country_name?: string;
      city?: string;
      error?: boolean;
      reason?: string;
    };
    if (data.error) return EMPTY;
    return {
      country: typeof data.country_name === 'string' ? data.country_name : null,
      city: typeof data.city === 'string' ? data.city : null,
    };
  } catch {
    // Timeout, DNS failure, JSON parse error, etc. — all roll up here.
    return EMPTY;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the client IP from a Next.js request. Honors the standard
 * proxy headers in the order they're set by Vercel/Cloudflare/etc.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for can be a list: "client, proxy1, proxy2". Use the
    // first hop (the originating client).
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  // Vercel-specific header used when neither x-forwarded-for nor
  // x-real-ip are set by an intermediate proxy.
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}
