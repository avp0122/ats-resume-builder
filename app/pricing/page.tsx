import PricingCard from '@/components/PricingCard';
import { PLANS } from '@/lib/pricing';

export const metadata = { title: 'Pricing — kresume' };

export default function PricingPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Pay once. Or don't pay at all.
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-fuchsia-200 to-sky-200 bg-clip-text text-transparent">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-white/60 max-w-xl mx-auto">
          Generate ATS-optimized resumes for free, with no card. Upgrade once for unlimited downloads — pay in crypto, no subscriptions.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>

      <div className="mt-14 grid md:grid-cols-3 gap-4 text-center text-sm text-white/60">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
          <div className="text-2xl mb-2">⚡</div>
          <p>Lifetime access. No subscriptions, no auto-renew.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
          <div className="text-2xl mb-2">🔒</div>
          <p>Non-custodial crypto. Funds go directly to our wallet, never a middleman.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
          <div className="text-2xl mb-2">🪪</div>
          <p>Your resume stays on your device. We process and discard.</p>
        </div>
      </div>
    </main>
  );
}
