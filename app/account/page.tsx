import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { effectivePlan } from '@/lib/plan';
import { SIGNED_IN_FREE_GENERATIONS } from '@/lib/pricing';
import ResumeSettings from '@/components/ResumeSettings';

export const metadata = { title: 'Account — kairesume' };

interface AccountPageProps {
  searchParams?: { firstResume?: string };
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  // Set by the home page redirect when a signed-in user lands here
  // without a stored resume on file (DECISION 024 onboarding nudge).
  const showFirstResumeBanner = searchParams?.firstResume === '1';
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
    .select('plan, pro_until, generations_count, created_at, resume_filename, resume_uploaded_at')
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
        .select('plan, pro_until, generations_count, created_at, resume_filename, resume_uploaded_at')
        .eq('id', user.id)
        .maybeSingle();
      profile = refreshed.data;
    } catch (e) {
      console.error('Profile self-heal failed:', e);
    }
  }

  const plan = effectivePlan(profile);
  const rawGenerationsCount = profile?.generations_count ?? 0;
  // For free users the count is conceptually capped at the limit. Pre-fix
  // rows in the DB may have over-counted (5, 6, 7…); clamp for display so
  // the user sees "3 / 3" instead of "6 / 3" and the remaining quota math
  // doesn't go negative.
  const generationsCount =
    plan === 'free'
      ? Math.min(rawGenerationsCount, SIGNED_IN_FREE_GENERATIONS)
      : rawGenerationsCount;
  const remainingFree = Math.max(0, SIGNED_IN_FREE_GENERATIONS - generationsCount);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
      </header>

      {showFirstResumeBanner && !profile?.resume_filename && (
        <div className="mt-6 rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-indigo-500/10 to-sky-400/10 p-5">
          <h2 className="text-base font-semibold text-white">
            Upload your resume to get started
          </h2>
          <p className="mt-1 text-sm text-white/70">
            kairesume keeps one resume per account. Drop your PDF or DOCX below — we&apos;ll
            extract the text once and reuse it every time you generate. You can replace
            it any time.
          </p>
        </div>
      )}

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
          <Stat
            label="Generations used"
            value={
              plan === 'pro'
                ? `${generationsCount} (unlimited)`
                : `${generationsCount} / ${SIGNED_IN_FREE_GENERATIONS}`
            }
          />
          <Stat
            label={plan === 'pro' ? 'Pro renews' : 'Member since'}
            value={
              plan === 'pro' && profile?.pro_until
                ? new Date(profile.pro_until).toLocaleDateString()
                : profile?.created_at
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
            {remainingFree > 0
              ? `Upgrade to Pro — $4.99/month`
              : `You've used your ${SIGNED_IN_FREE_GENERATIONS} free generations. Upgrade to Pro for unlimited.`}
          </Link>
        )}
      </section>

      <ResumeSettings
        initialFilename={profile?.resume_filename ?? null}
        initialUploadedAt={profile?.resume_uploaded_at ?? null}
      />
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
