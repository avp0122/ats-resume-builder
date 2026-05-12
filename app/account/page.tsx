import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Account — kresume' };

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white">Auth not configured</h1>
        <p className="mt-2 text-white/60">Add Supabase env vars to enable accounts.</p>
      </main>
    );
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  let { data: profile } = await supabase
    .from('profiles')
    .select('plan, generations_count, created_at')
    .eq('id', user.id)
    .maybeSingle();

  // Self-heal: if the auth signup trigger didn't create a profile row, make
  // one now via the admin (service-role) client so the user sees real values.
  if (!profile) {
    try {
      const admin = createSupabaseAdminClient();
      await admin
        .from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id' });
      const refreshed = await supabase
        .from('profiles')
        .select('plan, generations_count, created_at')
        .eq('id', user.id)
        .maybeSingle();
      profile = refreshed.data;
    } catch (e) {
      console.error('Profile self-heal failed:', e);
    }
  }

  const plan = profile?.plan ?? 'free';

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
      </header>

      <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">Email</div>
            <div className="text-white font-medium mt-1">{user.email}</div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              plan === 'pro'
                ? 'bg-gradient-to-r from-amber-400 to-fuchsia-500 text-slate-950'
                : 'bg-white/10 text-white/70'
            }`}
          >
            {plan.toUpperCase()}
          </span>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <Stat label="Generations" value={String(profile?.generations_count ?? 0)} />
          <Stat
            label="Member since"
            value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : new Date(user.created_at).toLocaleDateString()
            }
          />
        </div>

        {plan !== 'pro' && (
          <Link
            href="/pricing"
            className="mt-6 block text-center py-2.5 rounded-lg bg-gradient-to-r from-amber-400 via-fuchsia-500 to-indigo-500 text-slate-950 font-semibold hover:opacity-90 transition"
          >
            Upgrade to Pro
          </Link>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-sm text-white mt-1 break-words">{value}</div>
    </div>
  );
}
