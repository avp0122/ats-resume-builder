import type { Metadata } from 'next';
import Link from 'next/link';
import { listJobs, type Job } from '@/lib/jobs';
import RefreshJobsButton from '@/components/RefreshJobsButton';

const SITE_URL = 'https://kairesume.fit';

export const metadata: Metadata = {
  title: 'Fresh remote DevOps, SRE & Cloud jobs (last 24h) — global, France-friendly',
  description:
    'Hand-filtered list of DevOps, SRE, Cloud, Platform and Kubernetes engineer jobs posted in the last 24 hours, with global remote scope (open to candidates in France). Updated daily.',
  alternates: { canonical: `${SITE_URL}/jobs` },
  openGraph: {
    title: 'Fresh remote DevOps / SRE / Cloud jobs — last 24h, global',
    description:
      'DevOps, SRE, Cloud, Platform and Kubernetes engineer jobs posted in the last 24h, open to candidates in France or worldwide. Updated daily.',
    url: `${SITE_URL}/jobs`,
    type: 'website',
  },
};

// Static daily refresh per user spec: hit the source APIs at most once a day.
// Both APIs explicitly recommend ≤ 4 fetches/day; 1/day is well within ToS.
export const revalidate = 86400;

function formatHoursAgo(h: number): string {
  if (h < 1) return 'just posted';
  if (h < 2) return '1 hour ago';
  if (h < 24) return `${Math.floor(h)} hours ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SourceBadge({ source }: { source: Job['source'] }) {
  if (source === 'remoteok') {
    return (
      <a
        href="https://remoteok.com"
        target="_blank"
        rel="noopener"
        className="text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70"
      >
        Remote OK
      </a>
    );
  }
  return (
    <a
      href="https://remotive.com"
      target="_blank"
      rel="noopener"
      className="text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70"
    >
      Remotive
    </a>
  );
}

export default async function JobsPage() {
  const jobs = await listJobs();
  const generatedAt = new Date();

  // ItemList schema so search engines see this as a structured listing.
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Fresh remote DevOps / SRE / Cloud jobs',
    itemListElement: jobs.slice(0, 20).map((job, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: job.url,
      name: `${job.title} — ${job.company}`,
    })),
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <header className="mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
          Fresh remote jobs <span className="text-fuchsia-300">(last 24h)</span>
        </h1>
        <p className="mt-3 text-white/70 text-lg max-w-2xl">
          DevOps · SRE · Cloud · Platform · Kubernetes — open to candidates in France or
          worldwide. Refreshed once daily.
        </p>
        <p className="mt-4 text-xs text-white/40">
          Generated {generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC · Sources:{' '}
          <a
            href="https://remoteok.com"
            target="_blank"
            rel="noopener"
            className="underline hover:text-white/70"
          >
            Remote OK
          </a>{' '}
          ·{' '}
          <a
            href="https://remotive.com"
            target="_blank"
            rel="noopener"
            className="underline hover:text-white/70"
          >
            Remotive
          </a>
        </p>
        {/* Self-gated by /api/me/staff — invisible to everyone except
            users on the 'staff' plan. Clicking invalidates the cached
            fetches and triggers a fresh re-render. */}
        <RefreshJobsButton />
      </header>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8">
          <h2 className="text-xl font-semibold text-white">No fresh listings right now</h2>
          <p className="mt-2 text-white/70">
            Nothing matched the filters (DevOps/SRE/Cloud, posted in the last 24h, open to
            France). The page refreshes once a day — check back tomorrow.
          </p>
          <div className="mt-6 flex gap-3 text-sm">
            <Link
              href="/blog/remote-jobs-from-france-resume-tips"
              className="px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/20 transition"
            >
              Read: Applying for global remote from France →
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-md bg-white text-slate-950 hover:bg-white/90 transition"
            >
              Generate your resume →
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition"
            >
              <a
                href={job.url}
                target="_blank"
                rel="noopener"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <span>{formatHoursAgo(job.hoursAgo)}</span>
                    <span>·</span>
                    <span>{job.location}</span>
                    <span>·</span>
                    <SourceBadge source={job.source} />
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-white truncate">
                    {job.title}
                  </h2>
                  <p className="text-white/70">{job.company}</p>
                  {job.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {job.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded bg-white/5 text-xs text-white/60"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 px-4 py-2 rounded-md bg-white text-slate-950 font-medium text-sm group-hover:bg-white/90 transition">
                  Apply →
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <aside className="mt-16 p-6 rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-indigo-500/10 to-sky-400/10">
        <h2 className="text-xl font-semibold text-white">
          Before you apply: tailor your resume
        </h2>
        <p className="mt-2 text-white/70">
          Pick a job above, copy the description, and paste it into kairesume. We&apos;ll
          generate an ATS-optimized resume + cover letter tailored to that specific role in
          under a minute. First generation is free.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block px-5 py-2.5 rounded-md bg-white text-slate-950 font-medium hover:bg-white/90 transition"
        >
          Tailor my resume →
        </Link>
      </aside>

      <p className="mt-12 text-xs text-white/40 leading-relaxed">
        Listings sourced from Remote OK and Remotive per their public APIs and ToS. Clicking
        Apply takes you to the source listing on Remote OK or Remotive. kairesume is not
        the employer and does not handle applications. Per Remotive&apos;s ToS, listings on
        their side are delayed by 24 hours.
      </p>
    </main>
  );
}
