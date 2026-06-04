import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Public site URL used in the reset-email redirect link. Same resolution
 * logic as /api/auth/signup — env var first (so production always uses
 * the canonical host), then the request origin (so Vercel preview URLs
 * still self-link), then the prod fallback (so local dev still works).
 */
function resolveSiteUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const origin = request.headers.get('origin');
  if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) return origin.replace(/\/+$/, '');
  return 'https://kairesume.fit';
}

/**
 * Send a password-reset email via Supabase.
 *
 * The email link points at /auth/callback?code=<pkce-code>&next=/reset-password.
 * The callback exchanges the code for a recovery session, then forwards
 * the user to the reset-password form.
 *
 * Anti-enumeration: this route ALWAYS returns 200 once the input passes
 * basic validation — even when Supabase's downstream call errors. This
 * prevents a third party from probing which emails are registered. The
 * client UI mirrors this behavior (it shows "if an account exists..."
 * unconditionally).
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured on the server.' }, { status: 503 });
  }
  const { email } = (await request.json()) as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  // Land on our own callback so we can exchange the PKCE code into a
  // recovery session and then forward to /reset-password as a normal
  // authenticated page.
  const redirectTo = `${resolveSiteUrl(request)}/auth/callback?next=/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    // Most failures (e.g. "user not found") are intentionally not
    // surfaced — see anti-enumeration note above. Log on the server so
    // operators can still see real failures (SMTP outage, malformed
    // template, etc.).
    console.error('[auth/forgot-password] resetPasswordForEmail error (silenced to client):', error);
  }

  return NextResponse.json({ ok: true });
}
