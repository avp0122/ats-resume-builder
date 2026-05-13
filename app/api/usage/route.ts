import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { effectivePlan } from '@/lib/plan';
import { SIGNED_IN_FREE_GENERATIONS } from '@/lib/pricing';
import { readAnonCount, FREE_LIMIT } from '@/lib/usage';

/**
 * Return the caller's current quota so the home page can decide whether
 * to enable the "Generate" button BEFORE attempting a generation (and
 * BEFORE we burn an LLM call).
 *
 * Anonymous → freeLimit/anon, remaining = freeLimit - cookieCount.
 * Free signed in → freeLimit = SIGNED_IN_FREE_GENERATIONS, remaining = freeLimit - count.
 * Pro signed in → remaining = null (unlimited).
 */
export async function GET(_request: NextRequest) {
  let signedIn = false;
  let plan: 'free' | 'pro' = 'free';
  let count = 0;
  let proUntil: string | null = null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        signedIn = true;
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, pro_until, generations_count')
          .eq('id', user.id)
          .maybeSingle();
        plan = effectivePlan(profile);
        // Display value is clamped to the limit for free users so a stale
        // over-count (from before the cap fix) still renders as "3/3".
        const raw = profile?.generations_count ?? 0;
        count = plan === 'free' ? Math.min(raw, SIGNED_IN_FREE_GENERATIONS) : raw;
        proUntil = profile?.pro_until ?? null;
      }
    } catch {
      // Auth optional.
    }
  }

  const freeLimit = signedIn ? SIGNED_IN_FREE_GENERATIONS : FREE_LIMIT;
  let anonCount = 0;
  if (!signedIn) {
    try {
      anonCount = readAnonCount();
    } catch {
      // cookies() may throw outside a request context — defensive.
    }
    count = anonCount;
  }
  const remaining =
    plan === 'pro' ? null : Math.max(0, freeLimit - count);

  return NextResponse.json({
    signedIn,
    plan,
    count,
    freeLimit,
    remaining,
    proUntil,
    upgradeRequired: plan === 'free' && signedIn && remaining === 0,
  });
}
