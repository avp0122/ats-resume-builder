'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface SessionState {
  email: string | null;
  plan: 'free' | 'pro' | null;
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionState>({ email: null, plan: null });

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', data.user.id)
          .maybeSingle();
        setSession({ email: data.user.email ?? null, plan: (profile?.plan as any) ?? 'free' });
      } else {
        setSession({ email: null, plan: null });
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      router.refresh();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    if (isSupabaseConfigured()) {
      await createSupabaseBrowserClient().auth.signOut();
    }
    setSession({ email: null, plan: null });
    router.refresh();
    router.push('/');
  };

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/40 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-sky-400 grid place-items-center font-bold text-white shadow-lg shadow-fuchsia-500/30 group-hover:shadow-fuchsia-500/50 transition">
            K
          </span>
          <span className="text-white font-bold tracking-tight text-lg">kairesume</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3 text-sm">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md transition ${
              pathname === '/' ? 'text-white' : 'text-white/70 hover:text-white'
            }`}
          >
            Home
          </Link>
          <Link
            href="/pricing"
            className={`px-3 py-1.5 rounded-md transition ${
              pathname === '/pricing' ? 'text-white' : 'text-white/70 hover:text-white'
            }`}
          >
            Pricing
          </Link>
          {session.email ? (
            <>
              {session.plan === 'pro' ? (
                <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500 text-slate-950 text-xs font-bold">
                  PRO
                </span>
              ) : null}
              <Link
                href="/account"
                className="hidden sm:inline px-3 py-1.5 rounded-md text-white/70 hover:text-white transition"
              >
                {session.email}
              </Link>
              <button
                onClick={signOut}
                className="px-3 py-1.5 rounded-md text-white/70 hover:text-white transition"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="px-3 py-1.5 rounded-md text-white/80 hover:text-white transition"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-1.5 rounded-md bg-white text-slate-950 font-medium hover:bg-white/90 transition"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
