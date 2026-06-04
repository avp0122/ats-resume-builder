'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

/**
 * Forgot-password email entry form. POSTs to /api/auth/forgot-password.
 *
 * Anti-enumeration: the success message is shown unconditionally on a
 * 2xx response — we do not surface "no account with that email" because
 * that would let a third party probe the user list. The Supabase
 * resetPasswordForEmail call already has this behavior on its end; the
 * UI mirrors it.
 */
export default function ForgotPasswordForm({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  // initialError comes from the /auth/callback handler when a reset
  // link is expired or already-consumed — we display it on first paint
  // so the user knows why they were bounced back here.
  const [error, setError] = useState<string | null>(initialError);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reset email. Please try again.');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="relative">
        <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-fuchsia-500/30 via-indigo-500/20 to-sky-400/20 blur-2xl" />
        <div className="rounded-3xl bg-slate-950/70 backdrop-blur-xl border border-white/10 p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-white/60">
            Enter the email on your account and we&apos;ll send you a reset link.
          </p>

          {sent ? (
            // Shown unconditionally on 2xx — we do not reveal whether the
            // email actually existed in our database.
            <div className="mt-6 space-y-4">
              <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                If an account exists for <strong className="font-semibold">{email}</strong>, a
                reset link is on its way. Check your inbox (and spam folder) — the link is valid
                for one hour.
              </div>
              <Link
                href="/signin"
                className="block text-center text-sm text-fuchsia-300 hover:text-fuchsia-200 font-medium"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-fuchsia-500 via-indigo-500 to-sky-400 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-fuchsia-500/30 inline-flex items-center justify-center gap-2"
              >
                {loading ? (
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
                    Sending…
                  </>
                ) : (
                  <>Send reset link</>
                )}
              </button>

              <p className="text-center text-sm text-white/60 pt-2">
                Remembered it?{' '}
                <Link href="/signin" className="text-fuchsia-300 hover:text-fuchsia-200 font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
