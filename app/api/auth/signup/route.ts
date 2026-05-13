import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { parseUserAgent } from '@/lib/userAgent';
import { clientIpFromHeaders, lookupGeoIp } from '@/lib/geoip';
import { readAnonId, clearAnonId } from '@/lib/anonId';

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

  // Best-effort signup metadata write. We capture:
  //   - the email (the handle_new_user trigger does too — this is the
  //     belt-and-suspenders write in case the trigger isn't installed)
  //   - parsed User-Agent (OS + browser family + version)
  //   - client IP from the proxy headers
  //   - geo-IP (country / city) — done last because it makes an external
  //     call, kept under a 2-second timeout in lib/geoip.ts.
  //
  // Failures here MUST NOT block the signup response — the user account
  // already exists by this point. Any error is logged and swallowed.
  if (data.user) {
    const userId = data.user.id;
    const ua = parseUserAgent(request.headers.get('user-agent'));
    const ip = clientIpFromHeaders(request.headers);
    const geo = await lookupGeoIp(ip);

    const patch: Record<string, unknown> = {
      id: userId,
      email,
      signup_os: ua.os,
      signup_browser: ua.browser,
      signup_browser_version: ua.browserVersion,
      signup_country: geo.country,
      signup_city: geo.city,
      signup_ip: ip === 'unknown' ? null : ip,
    };

    try {
      // The auth.signUp call may have created an unconfirmed user with no
      // active session yet (depends on Supabase project settings). The
      // user's session client won't authenticate as them in that case, so
      // use the admin client for the upsert. RLS is bypassed by design
      // because we're writing fields the trigger seeded.
      const admin = createSupabaseAdminClient();
      const { error: upsertErr } = await admin
        .from('profiles')
        .upsert(patch, { onConflict: 'id' });
      if (upsertErr) {
        console.error('Signup metadata upsert failed (non-fatal):', upsertErr);
      }

      // Claim any pre-signup resume_uploads rows the visitor accumulated
      // under their anon_id. After this UPDATE the rows are owned by the
      // new account (user_id set, anon_id null) and pass the
      // resume_uploads_owner_set check constraint cleanly. We clear the
      // anon_id cookie so a future sign-out → anonymous-use round trip
      // starts a fresh visitor record instead of re-claiming the same
      // rows.
      const anonId = readAnonId();
      if (anonId) {
        const { error: claimErr } = await admin
          .from('resume_uploads')
          .update({ user_id: userId, anon_id: null })
          .eq('anon_id', anonId);
        if (claimErr) {
          console.error('Anon upload claim failed (non-fatal):', claimErr);
        }
        clearAnonId();
      }
    } catch (e) {
      console.error('Signup metadata write threw (non-fatal):', e);
    }
  }

  return NextResponse.json({ user: data.user });
}
