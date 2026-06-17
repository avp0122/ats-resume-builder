import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectivePlan } from '@/lib/plan';
import { ANON_FREE_CHAT_MESSAGES, SIGNED_IN_FREE_CHAT_MESSAGES } from '@/lib/pricing';
import { readAnonChatCount, bumpAnonChatCount } from '@/lib/chatUsage';

/**
 * Chat quota gate (DECISION 031). Called once per user turn in /api/chat,
 * BEFORE the LLM call — same principle as the generation gate in DECISION
 * 012: don't pay for inference the caller isn't allowed to use.
 *
 * Counting model (per UTC day):
 *   - Pro / Staff (effective 'pro'): unlimited. No counter touched.
 *   - Signed-in free: profiles.chat_count_today, reset lazily when
 *     chat_reset_at has passed (migration 015). Limit 50.
 *   - Anonymous: HMAC cookie via lib/chatUsage. Limit 5.
 *
 * `consume` increments the counter as a side effect when allowed. If the
 * caller is over the limit, nothing is incremented and `allowed` is false.
 */

export interface ChatQuotaResult {
  allowed: boolean;
  signedIn: boolean;
  plan: 'free' | 'pro';
  /** Messages left today after this turn; null = unlimited. */
  remaining: number | null;
  /** Daily limit; null = unlimited. */
  limit: number | null;
}

function nextUtcMidnight(from: Date): Date {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
}

export async function consumeChatQuota(): Promise<ChatQuotaResult> {
  // --- Signed-in path -------------------------------------------------
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, pro_until, chat_count_today, chat_reset_at')
          .eq('id', user.id)
          .maybeSingle();

        const plan = effectivePlan(profile);
        if (plan === 'pro') {
          return { allowed: true, signedIn: true, plan, remaining: null, limit: null };
        }

        // Free signed-in: lazy UTC-day reset.
        const now = new Date();
        const resetAt = profile?.chat_reset_at ? new Date(profile.chat_reset_at) : null;
        const expired = !resetAt || resetAt <= now;
        const count = expired ? 0 : profile?.chat_count_today ?? 0;
        const nextReset = expired ? nextUtcMidnight(now) : resetAt;
        const limit = SIGNED_IN_FREE_CHAT_MESSAGES;

        if (count >= limit) {
          return { allowed: false, signedIn: true, plan, remaining: 0, limit };
        }

        // Consume one. Service-role client so RLS on profiles doesn't block
        // the write. Best-effort: if the update fails we still allow the
        // turn rather than hard-blocking a paying-attention user.
        try {
          const admin = createSupabaseAdminClient();
          await admin
            .from('profiles')
            .update({
              chat_count_today: count + 1,
              chat_reset_at: nextReset.toISOString(),
            })
            .eq('id', user.id);
        } catch (e) {
          console.error('[chatQuota] counter update failed (allowing turn):', e);
        }

        return {
          allowed: true,
          signedIn: true,
          plan,
          remaining: Math.max(0, limit - (count + 1)),
          limit,
        };
      }
    } catch {
      // Auth optional / misconfigured — fall through to the anon path.
    }
  }

  // --- Anonymous path -------------------------------------------------
  const limit = ANON_FREE_CHAT_MESSAGES;
  const count = readAnonChatCount();
  if (count >= limit) {
    return { allowed: false, signedIn: false, plan: 'free', remaining: 0, limit };
  }
  const next = bumpAnonChatCount();
  return {
    allowed: true,
    signedIn: false,
    plan: 'free',
    remaining: Math.max(0, limit - next),
    limit,
  };
}
