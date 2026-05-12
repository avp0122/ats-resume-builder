/**
 * Detect the user's client OS + version from a browser context.
 *
 * Prefers `navigator.userAgentData` (Chromium / Edge with high-entropy hints)
 * because it exposes the real platform version — important for Windows 10
 * vs 11, which both report `Windows NT 10.0` in the legacy User-Agent.
 *
 * Falls back to UA-string parsing for Safari, Firefox, and older browsers.
 */

export type DetectedOS =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'ios'
  | 'unknown';

export interface ClientInfo {
  os: DetectedOS;
  /** Friendly version, e.g. "11", "14.4". May be "" if undetectable. */
  version: string;
  /** Slug for filenames: "windows_11", "macos_14_4", "ios", etc. */
  slug: string;
  /** Original UA for debugging. */
  userAgent: string;
}

const UNKNOWN: ClientInfo = {
  os: 'unknown',
  version: '',
  slug: 'unknown',
  userAgent: '',
};

export async function detectClient(): Promise<ClientInfo> {
  if (typeof navigator === 'undefined') return UNKNOWN;

  const userAgent = navigator.userAgent || '';
  const nav = navigator as unknown as {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<{
        platform?: string;
        platformVersion?: string;
      }>;
    };
  };

  // Modern Chromium path: high-entropy values include real platformVersion,
  // which lets us tell Windows 11 (>=13.0.0) from Windows 10 (<13.0.0).
  if (nav.userAgentData?.getHighEntropyValues) {
    try {
      const hints = await nav.userAgentData.getHighEntropyValues(['platformVersion']);
      const platform = (hints.platform || nav.userAgentData.platform || '').toLowerCase();
      const platformVersion = hints.platformVersion || '';
      const built = buildFromPlatform(platform, platformVersion, userAgent);
      if (built) return built;
    } catch {
      // fall through to UA parsing
    }
  }

  return parseUserAgent(userAgent);
}

function buildFromPlatform(
  platform: string,
  platformVersion: string,
  userAgent: string
): ClientInfo | null {
  if (!platform) return null;

  if (platform.includes('windows')) {
    const major = parseInt(platformVersion.split('.')[0] || '0', 10);
    const version = major >= 13 ? '11' : major > 0 ? '10' : '';
    return finalize('windows', version, userAgent);
  }
  if (platform.includes('macos')) {
    return finalize('macos', platformVersion, userAgent);
  }
  if (platform.includes('android')) {
    return finalize('android', platformVersion, userAgent);
  }
  if (platform.includes('linux') || platform.includes('chromeos')) {
    return finalize('linux', platformVersion, userAgent);
  }
  return null;
}

function parseUserAgent(ua: string): ClientInfo {
  if (!ua) return UNKNOWN;

  // iOS comes before macOS because iPad on iPadOS 13+ reports as "Macintosh"
  // unless we look for touch-only signals. Best-effort.
  if (/iPhone|iPod/.test(ua) || (/iPad/.test(ua) && /Mobile/.test(ua))) {
    const match = ua.match(/OS (\d+(?:_\d+){0,2})/);
    return finalize('ios', dotted(match?.[1] || ''), ua);
  }
  if (/Android/.test(ua)) {
    const match = ua.match(/Android (\d+(?:\.\d+){0,2})/);
    return finalize('android', match?.[1] || '', ua);
  }
  if (/Windows NT/.test(ua)) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    return finalize('windows', mapWindowsNT(match?.[1] || ''), ua);
  }
  if (/Mac OS X/.test(ua)) {
    const match = ua.match(/Mac OS X (\d+(?:_\d+){0,2})/);
    return finalize('macos', dotted(match?.[1] || ''), ua);
  }
  if (/Linux|X11/.test(ua)) {
    return finalize('linux', '', ua);
  }
  return { ...UNKNOWN, userAgent: ua };
}

function finalize(os: DetectedOS, version: string, userAgent: string): ClientInfo {
  const safeVersion = version.replace(/[^0-9.]/g, '').slice(0, 12);
  const slugPart = safeVersion ? `_${safeVersion.replace(/\./g, '_')}` : '';
  return {
    os,
    version: safeVersion,
    slug: `${os}${slugPart}`,
    userAgent,
  };
}

function dotted(s: string): string {
  return s.replace(/_/g, '.');
}

function mapWindowsNT(nt: string): string {
  // Legacy UA can't distinguish Win10 / Win11 — both report 10.0.
  // Without high-entropy hints we play it safe and return "10".
  switch (nt) {
    case '10.0':
      return '10';
    case '6.3':
      return '8.1';
    case '6.2':
      return '8';
    case '6.1':
      return '7';
    default:
      return nt.replace(/\./g, '_');
  }
}
