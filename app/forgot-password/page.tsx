import { redirect } from 'next/navigation';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata = {
  title: 'Reset your password — kairesume',
  description: 'Forgot your password? We will email you a reset link.',
  // Don't index the password-reset flow — it's a transactional page,
  // not content. Same treatment as the /reset-password page itself.
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  // /auth/callback redirects back here with `?error=...` when the PKCE
  // exchange fails (expired link, already-consumed code, etc.). Surfacing
  // that to the form is more helpful than swallowing it.
  searchParams?: { error?: string };
}) {
  // Signed-in users have no use for the reset flow — bounce them home
  // so the back-button doesn't trap them on a page that does nothing
  // for them.
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
    } catch {
      // Auth optional / misconfigured — fall through and render the form.
    }
  }
  if (signedIn) redirect('/');

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <ForgotPasswordForm initialError={searchParams?.error ?? null} />
    </main>
  );
}
