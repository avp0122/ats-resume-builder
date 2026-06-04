'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { startRouteProgress } from '@/lib/nav';

export default function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/signin';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (isSignup) {
        setInfo('Account created. Check your inbox for confirmation, then sign in.');
        // Keep `loading` true so the form stays in the redirecting state
        // until navigation actually starts.
        startRouteProgress();
        setTimeout(() => router.push('/signin'), 1200);
        return;
      }
      // Successful signin — start the global progress bar in this frame so
      // the bar shows during the otherwise-silent router.push + refresh
      // window. Keep `loading` true until the page actually changes.
      startRouteProgress();
      router.push('/');
      router.refresh();
      return;
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
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {isSignup
              ? 'Sign up to download unlimited tailored resumes.'
              : 'Sign in to download your generated resume.'}
          </p>

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
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-xs font-medium text-white/70">Password</label>
                {!isSignup && (
                  <Link
                    href="/forgot-password"
                    className="text-xs text-fuchsia-300 hover:text-fuchsia-200 font-medium"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isSignup ? 8 : undefined}
                className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/30 outline-none transition"
                placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
              />
            </div>

            {error && (
              <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                {error}
              </div>
            )}
            {info && (
              <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                {info}
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
                    <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  {info ? 'Redirecting…' : isSignup ? 'Creating account…' : 'Signing in…'}
                </>
              ) : (
                <>{isSignup ? 'Create account' : 'Sign in'}</>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/60">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link href="/signin" className="text-fuchsia-300 hover:text-fuchsia-200 font-medium">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link href="/signup" className="text-fuchsia-300 hover:text-fuchsia-200 font-medium">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
