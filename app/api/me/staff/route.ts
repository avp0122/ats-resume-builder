import { NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

/**
 * GET /api/me/staff
 *   → { isStaff: boolean }
 *
 * Tiny endpoint used by client components that need to know whether the
 * current user has the `'staff'` plan (DECISION 021). Lets us conditionally
 * render staff-only controls — like the "refresh jobs now" button on
 * /jobs — without exposing the full profile to the browser.
 *
 * We return `false` for any failure case (not signed in, Supabase not
 * configured, lookup error) — the staff features are progressive
 * enhancement, never security-critical, and the server-action receiver
 * re-verifies anyway.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ isStaff: false });
  }
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ isStaff: false });

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();

    return NextResponse.json({ isStaff: profile?.plan === 'staff' });
  } catch {
    return NextResponse.json({ isStaff: false });
  }
}
