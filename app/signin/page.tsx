import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata = { title: 'Sign in — kairesume' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  // Already signed in? Skip the form and send them where they came from
  // (or home), so the back-button doesn't trap people on the signin page.
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
    } catch {
      // Auth optional / misconfigured.
    }
  }
  if (signedIn) redirect(sanitizeNext(searchParams?.next));

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <AuthForm mode="signin" />
    </main>
  );
}

function sanitizeNext(value: string | undefined): string {
  // Only allow internal absolute paths to prevent open-redirect.
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}
