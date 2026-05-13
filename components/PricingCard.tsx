'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DEFAULT_PRO_PERIOD, PRO_TIERS, type BillingPeriod, type Plan } from '@/lib/pricing';
import type { EffectivePlan } from '@/lib/plan';

interface PricingCardProps {
  plan: Plan;
  /** Is the viewer currently signed in? */
  signedIn: boolean;
  /** Their resolved plan (free if signedOut or expired Pro). */
  currentPlan: EffectivePlan;
}

export default function PricingCard({ plan, signedIn, currentPlan }: PricingCardProps) {
  // Pro card carries a period selector inside it. Default to the
  // "POPULAR" 3-month tier when available so the user is nudged toward
  // the best perceived value rather than the absolute cheapest.
  const initialPeriod: BillingPeriod =
    plan.id === 'pro'
      ? PRO_TIERS.find((t) => t.badge === 'POPULAR')?.period ?? DEFAULT_PRO_PERIOD
      : DEFAULT_PRO_PERIOD;
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const selectedTier = PRO_TIERS.find((t) => t.period === period) ?? PRO_TIERS[0];

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

  const cta = pickCta(plan, signedIn, currentPlan, period);
  const displayPriceUSD = plan.id === 'pro' ? selectedTier.priceUSD : plan.priceUSD;
  const displayCadence =
    plan.id === 'pro' ? `/ ${selectedTier.label}` : plan.cadence === 'month' ? '/month' : '/forever';

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
            ${displayPriceUSD}
          </span>
          <span className="text-white/40 text-sm">{displayCadence}</span>
        </div>
        {plan.id === 'pro' && selectedTier.savingsPct > 0 && (
          <p className="mt-1 text-xs font-semibold text-emerald-300">
            Save {selectedTier.savingsPct}% vs. paying monthly
          </p>
        )}

        {/* Tier selector — only on the Pro card. Radio-group semantics for a11y. */}
        {plan.id === 'pro' && (
          <div role="radiogroup" aria-label="Pro billing period" className="mt-5 space-y-2">
            {PRO_TIERS.map((t) => {
              const isSelected = t.period === period;
              return (
                <button
                  key={t.period}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setPeriod(t.period)}
                  className={`w-full text-left rounded-xl border px-3.5 py-3 transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-2 ring-fuchsia-400/30'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{t.label}</span>
                      {t.badge && (
                        <span className="text-[10px] tracking-wider font-bold uppercase px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-400 to-fuchsia-500 text-slate-950">
                          {t.badge}
                        </span>
                      )}
                      {t.savingsPct > 0 && (
                        <span className="text-[11px] font-semibold text-emerald-300">
                          −{t.savingsPct}%
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/50 leading-snug">
                      {t.blurb}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-bold text-white">${t.priceUSD}</div>
                    <div className="text-[10px] text-white/40">total</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

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

function pickCta(
  plan: Plan,
  signedIn: boolean,
  currentPlan: EffectivePlan,
  period: BillingPeriod
): CtaResolution {
  const proStyle =
    'bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 hover:opacity-90';
  const subtleStyle = 'bg-white/10 hover:bg-white/15 text-white border border-white/10';

  if (plan.id === 'free') {
    if (!signedIn) {
      return { label: 'Sign up free', href: '/signup', className: subtleStyle };
    }
    return { label: 'Current plan', href: '', className: '', disabled: true, current: currentPlan === 'free' };
  }

  // Pro card behaviour: route includes the chosen period so the checkout
  // page renders the right tier without a second click.
  const checkoutHref = `/checkout?plan=pro&period=${period}`;
  if (!signedIn) {
    return {
      label: 'Sign up & upgrade',
      href: `/signup?next=${encodeURIComponent(checkoutHref)}`,
      className: proStyle,
    };
  }
  if (currentPlan === 'pro') {
    return {
      label: 'Renew Pro',
      href: checkoutHref,
      className: proStyle,
      current: true,
    };
  }
  return { label: 'Upgrade with crypto', href: checkoutHref, className: proStyle };
}
