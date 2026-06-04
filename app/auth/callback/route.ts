import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Supabase PKCE callback — exchanges the one-time `?code=` from a Supabase
 * email link (currently used by the password-reset flow) for a real
 * session, then forwards to `?next=`.
 *
 * Why this route exists:
 *   With @supabase/ssr's default PKCE flow, the link in the email points
 *   here with `?code=<one-time>`. We have to exchange that for a session
 *   cookie BEFORE the user can call any authenticated endpoint (e.g.
 *   `/api/auth/reset-password` which calls `updateUser({ password })`).
 *
 * Why it's reusable:
 *   The flow is identical whether the underlying email is "reset
 *   password", "magic link", or any other PKCE-bearing email Supabase
 *   sends — only the post-exchange destination differs, hence the `next`
 *   query param. Today only reset-password uses it; signup-confirm still
 *   uses the legacy `/signin?confirmed=1` redirect because that flow
 *   already works.
 *
 * Why `next` is sanitised:
 *   Without sanitisation, a malicious link like
 *   `/auth/callback?next=https://evil.com` would let an attacker phish
 *   our users by sending them through our own domain. Only internal
 *   absolute paths are allowed.
 */
function sanitizeNext(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  // Supabase may also pass an `error` / `error_description` if the email
  // link is malformed or already-consumed. Surface that to the user
  // instead of swallowing it.
  const supabaseError = searchParams.get('error_description') || searchParams.get('error');
  if (supabaseError) {
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent(supabaseError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('Missing or expired link. Please request a new reset email.')}`
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('Auth is not configured on the server.')}`
    );
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('Reset link expired or already used. Please request a new one.')}`
    );
  }

  // Exchange succeeded — session cookie is set on this response by
  // @supabase/ssr's cookie writer. Send the user to their target page
  // as a normal authenticated request.
  return NextResponse.redirect(`${origin}${next}`);
}
