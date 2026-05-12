'use client';

import Link from 'next/link';
import type { Plan } from '@/lib/pricing';
import type { EffectivePlan } from '@/lib/plan';

interface PricingCardProps {
  plan: Plan;
  /** Is the viewer currently signed in? */
  signedIn: boolean;
  /** Their resolved plan (free if signedOut or expired Pro). */
  currentPlan: EffectivePlan;
}

export default function PricingCard({ plan, signedIn, currentPlan }: PricingCardProps) {
  const accentRing =
    plan.accent === 'fuchsia'
      ? 'ring-fuchsia-400/40'
      : plan.accent === 'amber'
      ? 'ring-amber-400/40'
      : 'ring-sky-400/30';
  const accentGlow =
    plan.accent === 'fuchsia'
      ? 'from-fuchsia-500/40 via-indigo-500/30 to-sky-400/20'
      : plan.accent === 'amber'
      ? 'from-amber-400/40 via-rose-500/30 to-fuchsia-500/20'
      : 'from-sky-400/30 via-indigo-500/20 to-fuchsia-500/10';

  const cta = pickCta(plan, signedIn, currentPlan);

  return (
    <div className="relative">
      <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-br ${accentGlow} blur-xl opacity-70`} />
      <div
        className={`relative rounded-3xl bg-slate-950/70 backdrop-blur-xl border border-white/10 p-7 ring-1 ${accentRing} ${
          plan.highlighted ? 'scale-[1.02]' : ''
        }`}
      >
        {plan.highlighted && (
          <span className="absolute -top-3 left-7 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 text-slate-950 text-xs font-bold tracking-wide">
            BEST VALUE
          </span>
        )}
        {cta.current && (
          <span className="absolute -top-3 right-7 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-semibold tracking-wide">
            CURRENT PLAN
          </span>
        )}

        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
        <p className="mt-1 text-sm text-white/60">{plan.tagline}</p>

        <div className="mt-5 flex items-baseline gap-1">
          <span className="text-5xl font-bold tracking-tight text-white">
            ${plan.priceUSD}
          </span>
          <span className="text-white/40 text-sm">
            {plan.cadence === 'month' ? '/month' : '/forever'}
          </span>
        </div>

        <ul className="mt-6 space-y-2.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-white/80">
              <svg className="h-4 w-4 mt-0.5 text-emerald-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {cta.disabled ? (
          <button
            type="button"
            disabled
            className="mt-7 block w-full text-center px-4 py-2.5 rounded-lg font-semibold bg-white/5 border border-white/10 text-white/50 cursor-not-allowed"
          >
            {cta.label}
          </button>
        ) : (
          <Link
            href={cta.href}
            className={`mt-7 block text-center px-4 py-2.5 rounded-lg font-semibold transition ${cta.className}`}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}

interface CtaResolution {
  label: string;
  href: string;
  className: string;
  disabled?: boolean;
  current?: boolean;
}

function pickCta(plan: Plan, signedIn: boolean, currentPlan: EffectivePlan): CtaResolution {
  const proStyle =
    'bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 hover:opacity-90';
  const subtleStyle = 'bg-white/10 hover:bg-white/15 text-white border border-white/10';

  if (plan.id === 'free') {
    // Free card behaviour:
    //  - anonymous → Sign up free (goes to /signup)
    //  - signed-in on free → it's their current plan, nothing to do
    //  - signed-in on pro  → free is a downgrade; show as disabled
    if (!signedIn) {
      return { label: 'Sign up free', href: '/signup', className: subtleStyle };
    }
    return { label: 'Current plan', href: '', className: '', disabled: true, current: currentPlan === 'free' };
  }

  // Pro card behaviour:
  //  - anonymous → Sign up first, then redirect to checkout
  //  - signed-in on free → Upgrade with crypto
  //  - signed-in on pro  → Renew (pre-pays another 30 days)
  if (!signedIn) {
    return {
      label: 'Sign up & upgrade',
      href: '/signup?next=/checkout?plan=pro',
      className: proStyle,
    };
  }
  if (currentPlan === 'pro') {
    return {
      label: 'Renew Pro',
      href: '/checkout?plan=pro',
      className: proStyle,
      current: true,
    };
  }
  return { label: 'Upgrade with crypto', href: '/checkout?plan=pro', className: proStyle };
}
