import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata = { title: 'Account — kresume' };

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
  twitter: 'Twitter',
  other: 'Website',
};

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

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'plan, generations_count, created_at, full_name, contact_email, phone, location, date_of_birth, social_links'
    )
    .eq('id', user.id)
    .maybeSingle();

  const plan = profile?.plan ?? 'free';
  const socialLinks = (profile?.social_links ?? {}) as Record<string, string>;
  const linkEntries = Object.entries(socialLinks).filter(([, v]) => Boolean(v));

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Account</h1>
        <p className="text-white/50 text-sm mt-1">
          Personal details below are auto-populated from resumes you generate.
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">Sign-in email</div>
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
              profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'
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

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 backdrop-blur-xl p-6">
        <h2 className="text-sm font-semibold tracking-widest text-white/50 uppercase mb-4">
          Personal info
        </h2>
        {profile?.full_name ||
        profile?.phone ||
        profile?.location ||
        profile?.contact_email ||
        profile?.date_of_birth ||
        linkEntries.length ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {profile?.full_name && <Stat label="Full name" value={profile.full_name} />}
            {profile?.contact_email && (
              <Stat label="Contact email" value={profile.contact_email} />
            )}
            {profile?.phone && <Stat label="Phone" value={profile.phone} />}
            {profile?.location && <Stat label="Location" value={profile.location} />}
            {profile?.date_of_birth && (
              <Stat
                label="Date of birth"
                value={new Date(profile.date_of_birth).toLocaleDateString()}
              />
            )}
            {linkEntries.length > 0 && (
              <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-widest text-white/40">
                  Social links
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {linkEntries.map(([k, v]) => (
                    <li key={k}>
                      <a
                        href={v}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fuchsia-300 hover:text-fuchsia-200"
                      >
                        {SOCIAL_LABELS[k] || k}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-white/50 text-sm">
            Generate a resume to populate your profile automatically.
          </p>
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
