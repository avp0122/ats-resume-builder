'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshJobs } from '@/app/jobs/actions';

/**
 * Staff-only "Refresh now" button mounted on /jobs. Polls /api/me/staff on
 * mount to decide whether to render; absent for everyone else.
 *
 * The actual cache-invalidation happens in the refreshJobs() Server Action
 * (app/jobs/actions.ts), which re-checks staff status on the server. The
 * client gate here is purely UX — the security gate is server-side.
 */
export default function RefreshJobsButton() {
  const router = useRouter();
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<'idle' | 'ok' | 'err'>('idle');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/staff', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setIsStaff(Boolean(data?.isStaff));
      })
      .catch(() => {
        if (cancelled) return;
        setIsStaff(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isStaff) return null;

  const onClick = () => {
    setLastResult('idle');
    startTransition(async () => {
      const result = await refreshJobs();
      if (result.ok) {
        setLastResult('ok');
        // Pull the freshly-rendered HTML.
        router.refresh();
      } else {
        setLastResult('err');
      }
    });
  };

  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-200 text-sm font-medium hover:bg-fuchsia-500/25 transition disabled:opacity-60"
      >
        <svg
          className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M21 12a9 9 0 11-3-6.708M21 4v5h-5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {pending ? 'Refreshing…' : 'Refresh now'}
      </button>
      <span className="text-[11px] uppercase tracking-widest text-fuchsia-300/70">
        Staff
      </span>
      {lastResult === 'ok' && !pending && (
        <span className="text-xs text-emerald-300">Fetched fresh listings.</span>
      )}
      {lastResult === 'err' && !pending && (
        <span className="text-xs text-rose-300">Refresh failed — try again.</span>
      )}
    </div>
  );
}
