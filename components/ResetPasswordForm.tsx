'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRouteProgress } from '@/lib/nav';

/**
 * Set-a-new-password form. The recovery session (or an existing signed-in
 * session) is established by the time this renders — the server component
 * wrapper bounces unauthenticated visitors back to /forgot-password.
 *
 * The two-field "password + confirm" pattern guards against typos in a
 * masked field. We do not enforce strength rules beyond Supabase's
 * server-side minimum length — keeping the bar low here mirrors signup
 * (which also only enforces 8 chars) and avoids surprise rejections.
 */
export default function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not set your new password. Please try again.');
      setDone(true);
      // Brief pause so the user sees the success state, then bounce home
      // — they're still signed in (updateUser doesn't terminate the
      // session) so they land on the authenticated home page.
      startRouteProgress();
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/20 to-sky-400/20 blur-2xl" />
        <div className="rounded-3xl bg-slate-950/70 backdrop-blur-xl border border-white/10 p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">Set a new password</h1>
          {email && (
            <p className="mt-1 text-sm text-white/60">
              For <strong className="font-semibold">{email}</strong>.
            </p>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
                placeholder="Retype the same password"
              />
            </div>

            {error && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                {error}
              </div>
            )}
            {done && (
              <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                Password updated. Redirecting…
              </div>
            )}

            <button
              type="submit"
              disabled={loading || done}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30 inline-flex items-center justify-center gap-2"
            >
              {loading || done ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
                    <path
                      d="M22 12a10 10 0 01-10 10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                  {done ? 'Redirecting…' : 'Saving…'}
                </>
              ) : (
                <>Update password</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
