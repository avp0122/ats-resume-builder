import { redirect } from 'next/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';
import HomeClient from './HomeClient';

// Force dynamic rendering. Without env vars at build time the route would
// snapshot the anonymous branch as static — in production that would freeze
// every signed-in user on the anonymous flow until next deploy. Reading
// cookies via createSupabaseServerClient() would normally mark this dynamic
// automatically, but we set it explicitly so a missing-env-vars build still
// behaves correctly at runtime.
export const dynamic = 'force-dynamic';

/**
 * Server-side wrapper for the home page. Three branches:
 *
 *   1. Supabase not configured → render the anonymous flow as before.
 *      (Used in local dev without auth creds.)
 *   2. No session → anonymous flow, file upload required per generation.
 *   3. Signed in:
 *      a) Has a stored resume → render HomeClient in "JD-only" mode with
 *         the filename passed in for the saved-resume panel.
 *      b) No stored resume → redirect to /account so they upload one
 *         first. This is the per-DECISION 024 onboarding nudge: the v2
 *         flow requires a resume on file.
 *
 * Anonymous and signed-in-with-stored-resume both render the same
 * HomeClient component; we just toggle the upload UI via props.
 */
export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return <HomeClient signedIn={false} storedResumeFilename={null} />;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <HomeClient signedIn={false} storedResumeFilename={null} />;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_filename')
    .eq('id', user.id)
    .maybeSingle();

  const filename: string | null = profile?.resume_filename ?? null;

  if (!filename) {
    // Per the v2 flow, signed-in users without a stored resume go to
    // /account first to upload one. `?firstResume=1` lets the account
    // page render a one-time onboarding banner if it wants to.
    redirect('/account?firstResume=1');
  }

  return <HomeClient signedIn={true} storedResumeFilename={filename} />;
}
