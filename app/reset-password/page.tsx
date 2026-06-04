import { redirect } from 'next/navigation';
import ResetPasswordForm from '@/components/ResetPasswordForm';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const metadata = {
  title: 'Set a new password — kairesume',
  description: 'Choose a new password for your kairesume account.',
  // Transactional page — keep out of search engines.
  robots: { index: false, follow: false },
};

// The recovery session is fresh — read it server-side at request time.
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  // The page is reachable in two ways:
  //   1. From /auth/callback after a successful PKCE exchange (the user
  //      now has a recovery session).
  //   2. From a normal signed-in user who navigated here directly to
  //      change their password proactively. We support that too — it's
  //      the same updateUser({ password }) call under the hood.
  // Anyone without a session at all gets sent to /forgot-password so
  // they go through the email flow.
  if (!isSupabaseConfigured()) {
    redirect('/forgot-password?error=Auth%20is%20not%20configured%20on%20the%20server.');
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/forgot-password');
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <ResetPasswordForm email={user.email ?? null} />
    </main>
  );
}
