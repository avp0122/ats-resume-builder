import { SIGNED_IN_FREE_GENERATIONS } from './pricing';

export interface ProfileLike {
  plan?: string | null;
  pro_until?: string | null;
  generations_count?: number | null;
}

export type EffectivePlan = 'free' | 'pro';

/**
 * Treat Pro as expired once `pro_until` is in the past — that's how we model
 * monthly billing without a payments scheduler. The DB column is
 * authoritative; we don't auto-rewrite `plan` on every read.
 *
 * `'staff'` is a third stored value (not a purchasable plan) for users we've
 * comped — friends-of-the-house, reviewers, our own accounts. It maps to
 * effective 'pro' unconditionally (no `pro_until` check), so every downstream
 * `=== 'pro'` check keeps working without modification. Set via SQL:
 *   update profiles set plan='staff' where id='<uuid>';
 * Keep it out of the purchasable PlanId union in pricing.ts on purpose —
 * nothing in the UI should ever offer it.
 */
export function effectivePlan(profile: ProfileLike | null | undefined): EffectivePlan {
  if (!profile) return 'free';
  if (profile.plan === 'staff') return 'pro';
  if (profile.plan === 'pro' && profile.pro_until && new Date(profile.pro_until) > new Date()) {
    return 'pro';
  }
  return 'free';
}

/**
 * For a signed-in free user, return whether they can still download. We use
 * a lifetime counter for v1 (no monthly reset job) — keep the threshold
 * documented in pricing.ts as the source of truth.
 */
export function signedInFreeDownloadAllowed(generationsCount: number): boolean {
  return generationsCount <= SIGNED_IN_FREE_GENERATIONS;
}
