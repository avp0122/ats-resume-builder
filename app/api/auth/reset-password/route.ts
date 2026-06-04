import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * Apply a new password to the current user via Supabase.
 *
 * Requires an active session. Two ways the caller gets one:
 *   1. They followed the email link → /auth/callback exchanged a PKCE
 *      code into a recovery session.
 *   2. They were already signed in and navigated to /reset-password
 *      directly (proactive password change).
 *
 * Anything without a session is rejected — same boundary as updateUser
 * itself, but we check explicitly so the error message is clear.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured on the server.' }, { status: 503 });
  }
  const { password } = (await request.json()) as { password?: string };
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'A new password is required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Your reset link has expired. Please request a new one from the forgot-password page.' },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase rejects e.g. "same as old password" / "password too weak"
    // here. Pass the message through verbatim — these are user-actionable.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
