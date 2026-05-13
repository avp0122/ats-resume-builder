/**
 * Tiny User-Agent parser. Server-side only — uses just the UA header.
 *
 * Why hand-rolled instead of ua-parser-js: it's a 50-line file (vs.
 * pulling a 300KB dep) and we only need rough OS + browser bucketing
 * for analytics, not exhaustive UA fingerprinting. If we ever need to
 * distinguish things like "Chrome on Android WebView" vs. "Chrome
 * Mobile", swap this for the library.
 *
 * Returns nulls for fields it can't extract — the column allows null so
 * the caller can save what it knows without falling back to a sentinel
 * like "Unknown".
 */

export interface ParsedUserAgent {
  os: string | null;
  browser: string | null;
  browserVersion: string | null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || typeof ua !== 'string') {
    return { os: null, browser: null, browserVersion: null };
  }

  return {
    os: detectOs(ua),
    ...detectBrowser(ua),
  };
}

function detectOs(ua: string): string | null {
  // Order matters: iPhone/iPad UAs include "Mac OS X" too, so iOS first.
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

interface BrowserMatch {
  browser: string | null;
  browserVersion: string | null;
}

function detectBrowser(ua: string): BrowserMatch {
  // Order matters: Chromium-based browsers (Edge, Opera, Brave) include
  // "Chrome" in their UA. Match the more specific tokens first.
  const patterns: Array<[RegExp, string]> = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Vivaldi\/([\d.]+)/, 'Vivaldi'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    // Safari: "Version/16.4 ... Safari/605.1.15" — Version is the user-
    // facing release, Safari/ is the WebKit build, so we use Version.
    [/Version\/([\d.]+).+Safari/, 'Safari'],
  ];
  for (const [re, name] of patterns) {
    const m = ua.match(re);
    if (m) return { browser: name, browserVersion: m[1] || null };
  }
  return { browser: null, browserVersion: null };
}
