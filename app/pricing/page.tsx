import PricingCard from '@/components/PricingCard';
import { PLANS } from '@/lib/pricing';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { effectivePlan, type EffectivePlan } from '@/lib/plan';

export const metadata = { title: 'Pricing — kairesume' };

export default async function PricingPage() {
  // Detect viewer status so each card can show the right CTA.
  //   - Anonymous   → free shows "Sign up free", pro shows "Sign up & upgrade"
  //   - Free signed → free shows "Current plan" (disabled), pro is the upgrade CTA
  //   - Pro signed  → pro shows "Current plan", free is disabled
  let signedIn = false;
  let plan: EffectivePlan = 'free';
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
          .select('plan, pro_until')
          .eq('id', user.id)
          .maybeSingle();
        plan = effectivePlan(profile);
      }
    } catch {
      // Auth optional.
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          From $4.99 / month — save up to 30% with longer terms.
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-fuchsia-200 to-sky-200 bg-clip-text text-transparent">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-white/60 max-w-xl mx-auto">
          Try it free, then go Pro for unlimited generations. Choose monthly, 3 months
          (20% off) or 1 year (30% off). Pay in crypto — no card on file, no auto-renew.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {PLANS.map((p) => (
          <PricingCard key={p.id} plan={p} signedIn={signedIn} currentPlan={plan} />
        ))}
      </div>

      <div className="mt-14 grid md:grid-cols-2 gap-4 text-center text-sm text-white/60 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
          <div className="text-2xl mb-2">⚡</div>
          <p>Pay each month manually. No auto-renew, no card on file.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5">
          <div className="text-2xl mb-2">🪪</div>
          <p>Your resume stays on your device. We process and discard.</p>
        </div>
      </div>
    </main>
  );
}
