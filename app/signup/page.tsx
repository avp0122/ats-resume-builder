import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata = { title: 'Sign up — kresume' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
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
      <AuthForm mode="signup" />
    </main>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}
