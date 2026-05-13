import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

// Public site URL used in confirmation emails. Falls back to the request
// origin so previews on Vercel preview URLs still work, then to the prod
// domain. Set NEXT_PUBLIC_SITE_URL=https://kairesume.fit in production so
// Supabase doesn't ever bake "http://localhost:3000" into the confirm link.
function resolveSiteUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const origin = request.headers.get('origin');
  if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) return origin.replace(/\/+$/, '');
  return 'https://kairesume.fit';
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured on the server.' }, { status: 503 });
  }
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  const supabase = createSupabaseServerClient();
  // emailRedirectTo controls where Supabase sends the user after clicking
  // the confirmation link. Without this, Supabase falls back to its
  // dashboard-configured Site URL (which is "http://localhost:3000" by
  // default — the source of the bug in confirmation emails). The
  // Supabase dashboard's "Site URL" + "Redirect URLs" should ALSO be set
  // to https://kairesume.fit so the link target itself uses the prod host.
  const emailRedirectTo = `${resolveSiteUrl(request)}/signin?confirmed=1`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Supabase's anti-enumeration behavior returns a "user" object even when
  // the email already exists — but with an empty `identities` array. Detect
  // that so we don't silently show a "check your inbox" message for an
  // already-registered email.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json(
      { error: 'An account with that email already exists. Try signing in instead.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ user: data.user });
}
